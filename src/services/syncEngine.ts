import { ApiError, api, describeApiError } from './api';

export const COLLECTIONS = [
  'users',
  'projects',
  'workflows',
  'epics',
  'sprints',
  'versions',
  'issues',
  'teams',
  'automationRules',
  'automationLogs',
  'savedFilters',
  'dashboards',
  'plans',
  'goals',
  'assets',
  'risks',
  'milestones',
  'notifications',
  'repositories',
  'siteConfig',
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];
type Rec = Record<string, unknown> & { id: string };

export type SyncState = 'idle' | 'saving' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pending: number;
  lastError?: string;
  lastSavedAt?: string;
}

export interface IssuedCredential {
  userId: string;
  email: string;
  temporaryPassword: string;
}

export interface BootstrapPayload {
  collections: Record<string, Rec[]>;
  versions: Record<string, Record<string, number>>;
  seq: number;
  epoch: number;
}

export interface SyncHandlers {
  /** Insert or replace one record in React state. */
  upsert(collection: CollectionName, record: Rec): void;
  remove(collection: CollectionName, id: string): void;
  replaceAll(collection: CollectionName, records: Rec[]): void;
  onStatus(status: SyncStatus): void;
  onNotice(type: 'error' | 'info', message: string): void;
  onCredentials(creds: IssuedCredential[]): void;
  /** The server data set was reset (or the client fell too far behind): reload everything. */
  onEpochChange(): void;
}

interface PendingOp {
  collection: CollectionName;
  id: string;
  op: 'upsert' | 'delete';
  data?: Rec;
  json?: string;
}

interface BatchResponse {
  results: Array<{ collection: string; id: string; version: number; deleted?: boolean; record?: Rec }>;
  seq: number;
  issuedCredentials: IssuedCredential[];
}

/** JSON.stringify with sorted keys so key order never causes spurious writes. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

const key = (c: string, id: string) => `${c}/${id}`;
const FLUSH_DELAY_MS = 350;
const POLL_INTERVAL_MS = 8000;

export class SyncEngine {
  private handlers: SyncHandlers;
  private snapshot = new Map<string, string>(); // key -> stable json known to be on the server
  private versions = new Map<string, number>();
  private latest = new Map<string, string>(); // key -> stable json of latest local value
  private lastItems = new Map<CollectionName, Rec[]>(); // latest React state per collection
  private pending = new Map<string, PendingOp>();
  private inFlight = new Map<string, PendingOp>();
  private passwords = new Map<string, string>();
  private active = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryDelay = 0;
  private flushing = false;
  private polling = false;
  private seq = 0;
  private epoch = 0;
  private lastError: string | undefined;
  private lastSavedAt: string | undefined;
  private offline = false;

  constructor(handlers: SyncHandlers) {
    this.handlers = handlers;
  }

  // -------------------------------------------------------------- lifecycle
  start(boot: BootstrapPayload): void {
    this.stop();
    this.active = true;
    this.seq = boot.seq;
    this.epoch = boot.epoch;
    for (const name of COLLECTIONS) {
      for (const rec of boot.collections[name] || []) {
        const k = key(name, rec.id);
        const json = stableStringify(rec);
        this.snapshot.set(k, json);
        this.latest.set(k, json);
        this.versions.set(k, boot.versions[name]?.[rec.id] ?? 1);
      }
    }
    this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
    if (typeof window !== 'undefined') window.addEventListener('focus', this.onFocus);
    this.emitStatus();
  }

  stop(): void {
    this.active = false;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.flushTimer = null;
    this.pollTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('focus', this.onFocus);
    this.snapshot.clear();
    this.versions.clear();
    this.latest.clear();
    this.pending.clear();
    this.inFlight.clear();
    this.lastItems.clear();
    this.passwords.clear();
    this.retryDelay = 0;
    this.flushing = false;
    this.offline = false;
    this.lastError = undefined;
  }

  private onFocus = () => {
    void this.poll();
    if (this.pending.size > 0) this.scheduleFlush(0);
  };

  setUserPassword(userId: string, password: string): void {
    this.passwords.set(userId, password);
  }

  // -------------------------------------------------------------- local -> server
  /** Called whenever a collection's React state changes. Computes a diff against the server snapshot. */
  submit(collection: CollectionName, items: Rec[]): void {
    if (!this.active) return;
    this.lastItems.set(collection, items);
    const seen = new Set<string>();
    let changed = false;

    for (const item of items) {
      const k = key(collection, item.id);
      seen.add(k);
      const json = stableStringify(item);
      this.latest.set(k, json);
      const serverJson = this.snapshot.get(k);
      if (serverJson === json) {
        if (this.pending.delete(k)) changed = true;
        continue;
      }
      const inflight = this.inFlight.get(k);
      if (inflight && inflight.json === json) continue; // already being saved
      this.pending.set(k, { collection, id: item.id, op: 'upsert', data: item, json });
      changed = true;
    }

    // deletions: anything we know on the server for this collection that is no longer in state
    const prefix = `${collection}/`;
    for (const k of [...this.snapshot.keys()]) {
      if (!k.startsWith(prefix) || seen.has(k)) continue;
      if (this.inFlight.get(k)?.op === 'delete') continue;
      this.pending.set(k, { collection, id: k.slice(prefix.length), op: 'delete' });
      this.latest.delete(k);
      changed = true;
    }
    // Items created locally and deleted again before being flushed never reach the server.
    for (const [k, op] of [...this.pending]) {
      if (op.collection === collection && op.op === 'upsert' && !seen.has(k) && !this.snapshot.has(k)) {
        this.pending.delete(k);
        changed = true;
      }
    }

    if (changed) {
      this.emitStatus();
      this.scheduleFlush(FLUSH_DELAY_MS);
    }
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), delay);
  }

  /** Resolves when every pending change has been persisted (or failed permanently). */
  async flushNow(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (let i = 0; i < 5 && (this.pending.size > 0 || this.flushing); i++) {
      await this.flush();
      if (this.offline) break;
    }
  }

  private async flush(): Promise<void> {
    if (!this.active || this.flushing || this.pending.size === 0) return;
    this.flushing = true;
    const batch = [...this.pending.values()].slice(0, 400);
    for (const op of batch) {
      this.pending.delete(key(op.collection, op.id));
      this.inFlight.set(key(op.collection, op.id), op);
    }
    this.emitStatus('saving');

    let succeeded = false;
    try {
      const res = await api.post<BatchResponse>('/api/data/batch', {
        ops: batch.map(op => ({
          collection: op.collection,
          op: op.op,
          id: op.id,
          ...(op.op === 'upsert'
            ? {
                data:
                  op.collection === 'users' && this.passwords.has(op.id)
                    ? { ...op.data, password: this.passwords.get(op.id) }
                    : op.data,
              }
            : {}),
          ...(this.versions.has(key(op.collection, op.id)) ? { baseVersion: this.versions.get(key(op.collection, op.id)) } : {}),
        })),
      });
      this.onBatchSuccess(batch, res);
      succeeded = true;
    } catch (err) {
      await this.onBatchFailure(batch, err);
    } finally {
      for (const op of batch) this.inFlight.delete(key(op.collection, op.id));
      this.flushing = false;
      if (succeeded) {
        setTimeout(() => void this.poll(), 1500);
        setTimeout(() => void this.poll(), 5000);
        // Re-diff: the user may have created/deleted/edited records while the request was in flight.
        for (const c of new Set(batch.map(b => b.collection))) {
          const items = this.lastItems.get(c);
          if (items) this.submit(c, items);
        }
      }
      this.emitStatus();
      if (this.pending.size > 0 && this.active) this.scheduleFlush(this.retryDelay || 50);
    }
  }

  private onBatchSuccess(batch: PendingOp[], res: BatchResponse): void {
    this.offline = false;
    this.retryDelay = 0;
    this.lastError = undefined;
    this.lastSavedAt = new Date().toISOString();
    for (const result of res.results) {
      const k = key(result.collection, result.id);
      const sent = batch.find(b => b.collection === result.collection && b.id === result.id);
      if (result.deleted) {
        this.snapshot.delete(k);
        this.versions.delete(k);
        this.passwords.delete(result.id);
        continue;
      }
      this.versions.set(k, result.version);
      if (sent?.json) this.snapshot.set(k, sent.json);
      if (sent?.collection === 'users') this.passwords.delete(sent.id);
      if (result.record) {
        const canonical = stableStringify(result.record);
        // Only overwrite local state if the user has not edited the record since it was sent.
        if (this.latest.get(k) === sent?.json) {
          this.snapshot.set(k, canonical);
          this.latest.set(k, canonical);
          this.emitUpsert(result.collection as CollectionName, result.record as Rec);
        }
      }
    }
    if (res.seq > this.seq) this.seq = res.seq;
    if (res.issuedCredentials?.length) this.handlers.onCredentials(res.issuedCredentials);
  }

  private async onBatchFailure(batch: PendingOp[], err: unknown): Promise<void> {
    const apiErr = err instanceof ApiError ? err : null;

    if (!apiErr || apiErr.isTransient) {
      // Network problem or server hiccup: keep the work and retry with exponential backoff.
      this.offline = true;
      this.retryDelay = Math.min(this.retryDelay ? this.retryDelay * 2 : 1000, 30000);
      this.lastError = apiErr ? describeApiError(apiErr) : 'Connection lost.';
      for (const op of batch) {
        const k = key(op.collection, op.id);
        if (!this.pending.has(k)) this.pending.set(k, op); // newer local edits win
      }
      return;
    }

    if (apiErr.status === 401) {
      // The global unauthorized listener signs the user out; nothing else to do here.
      this.lastError = apiErr.message;
      return;
    }

    if (apiErr.status === 409) {
      const d = apiErr.details as { collection?: string; id?: string; current?: Rec; version?: number } | undefined;
      if (d?.collection && d.id) {
        const k = key(d.collection, d.id);
        this.pending.delete(k);
        if (d.current) {
          const json = stableStringify(d.current);
          this.snapshot.set(k, json);
          this.latest.set(k, json);
          if (typeof d.version === 'number') this.versions.set(k, d.version);
          this.emitUpsert(d.collection as CollectionName, d.current);
        } else {
          await this.resyncCollections([d.collection as CollectionName]);
        }
        this.handlers.onNotice('error', `${d.collection}/${d.id} was changed by someone else. Your edit was discarded; the latest version was loaded.`);
        // Batch was rolled back atomically: retry the other operations.
        for (const op of batch) {
          const ok = key(op.collection, op.id);
          if (ok !== k && !this.pending.has(ok)) this.pending.set(ok, op);
        }
        this.retryDelay = 0;
        return;
      }
    }

    // Permanent rejection (403 / 413 / 422 ...): roll local state back to the server truth.
    this.lastError = describeApiError(apiErr);
    this.handlers.onNotice('error', this.lastError);
    const touched = [...new Set(batch.map(b => b.collection))];
    for (const c of touched) {
      for (const k of [...this.pending.keys()]) if (k.startsWith(`${c}/`)) this.pending.delete(k);
    }
    await this.resyncCollections(touched);
  }

  // -------------------------------------------------------------- server -> local
  private async resyncCollections(collections: CollectionName[]): Promise<void> {
    for (const c of collections) {
      try {
        const res = await api.get<{ items: Rec[]; versions: Record<string, number> }>(`/api/data/${c}`);
        const prefix = `${c}/`;
        for (const k of [...this.snapshot.keys()]) if (k.startsWith(prefix)) this.snapshot.delete(k);
        for (const k of [...this.latest.keys()]) if (k.startsWith(prefix)) this.latest.delete(k);
        for (const k of [...this.versions.keys()]) if (k.startsWith(prefix)) this.versions.delete(k);
        for (const item of res.items) {
          const k = key(c, item.id);
          const json = stableStringify(item);
          this.snapshot.set(k, json);
          this.latest.set(k, json);
          this.versions.set(k, res.versions[item.id] ?? 1);
        }
        this.emitReplace(c, res.items);
      } catch {
        // If even the refetch fails we are probably offline; the poller will catch up later.
      }
    }
  }

  async poll(): Promise<void> {
    if (!this.active || this.polling || this.flushing) return;
    this.polling = true;
    try {
      const res = await api.get<{
        epoch: number;
        seq: number;
        resync: boolean;
        changes: Array<{ collection: string; id: string; deleted: boolean; version?: number; record?: Rec }>;
      }>(`/api/changes?since=${this.seq}`);
      if (this.offline) {
        this.offline = false;
        this.retryDelay = 0;
        this.emitStatus();
        if (this.pending.size > 0) this.scheduleFlush(0);
      }
      if (res.epoch !== this.epoch || res.resync) {
        this.handlers.onEpochChange();
        return;
      }
      for (const ch of res.changes) {
        if (!(COLLECTIONS as readonly string[]).includes(ch.collection)) continue;
        const k = key(ch.collection, ch.id);
        if (this.pending.has(k) || this.inFlight.has(k)) continue; // local edit pending: reconcile on flush
        if (ch.deleted) {
          if (this.snapshot.has(k)) {
            this.snapshot.delete(k);
            this.latest.delete(k);
            this.versions.delete(k);
            this.emitRemove(ch.collection as CollectionName, ch.id);
          }
        } else if (ch.record && this.versions.get(k) !== ch.version) {
          const json = stableStringify(ch.record);
          this.snapshot.set(k, json);
          this.latest.set(k, json);
          this.versions.set(k, ch.version ?? 1);
          this.emitUpsert(ch.collection as CollectionName, ch.record);
        }
      }
      this.seq = res.seq;
    } catch (err) {
      if (!(err instanceof ApiError) || err.isTransient) {
        if (!this.offline) {
          this.offline = true;
          this.lastError = 'Connection lost. Changes will be saved when the connection returns.';
          this.emitStatus();
        }
      }
    } finally {
      this.polling = false;
    }
  }

  // Remote changes are mirrored into lastItems so a later re-diff never resurrects stale local data.
  private emitUpsert(collection: CollectionName, record: Rec): void {
    const items = this.lastItems.get(collection);
    if (items) {
      const idx = items.findIndex(i => i.id === record.id);
      this.lastItems.set(collection, idx >= 0 ? items.map((i, n) => (n === idx ? record : i)) : [...items, record]);
    }
    this.handlers.upsert(collection, record);
  }

  private emitRemove(collection: CollectionName, id: string): void {
    const items = this.lastItems.get(collection);
    if (items) this.lastItems.set(collection, items.filter(i => i.id !== id));
    this.handlers.remove(collection, id);
  }

  private emitReplace(collection: CollectionName, records: Rec[]): void {
    this.lastItems.set(collection, records);
    this.handlers.replaceAll(collection, records);
  }

  // -------------------------------------------------------------- status
  private emitStatus(forced?: SyncState): void {
    let state: SyncState = 'idle';
    if (forced) state = forced;
    else if (this.offline) state = 'offline';
    else if (this.lastError && this.pending.size > 0) state = 'error';
    else if (this.pending.size > 0 || this.inFlight.size > 0) state = 'saving';
    this.handlers.onStatus({
      state,
      pending: this.pending.size + this.inFlight.size,
      lastError: this.lastError,
      lastSavedAt: this.lastSavedAt,
    });
  }

  /**
   * Re-reads one record from the server and replaces the local copy (used after server-side changes
   * that bypass the diff sync, e.g. file uploads). Pending local edits are flushed first.
   */
  async refreshRecord(collection: CollectionName, id: string): Promise<void> {
    await this.flushNow();
    const res = await api.get<{ item: Rec; version: number }>(`/api/data/${collection}/${id}`);
    const k = key(collection, id);
    const json = stableStringify(res.item);
    this.snapshot.set(k, json);
    this.latest.set(k, json);
    this.versions.set(k, res.version);
    this.emitUpsert(collection, res.item);
  }

  retryNow(): void {
    this.retryDelay = 0;
    this.scheduleFlush(0);
    void this.poll();
  }
}
