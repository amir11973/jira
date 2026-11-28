import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getMeta, setMeta, transaction } from './db.ts';
import type { AuthMethod } from './httpClient.ts';
import { encryptSecret, decryptSecret, scrubSensitiveMetadata } from './cryptoVault.ts';

export type ProviderKind = 'jira' | 'confluence' | 'github' | 'gitlab';
export type AllProviderKind = ProviderKind | 'excel';
export type HealthStatus = 'healthy' | 'degraded' | 'unreachable' | 'needs_reauth';

export interface StoredConnectionRecord {
  id: string;
  organizationId: string;
  userId: string;
  provider: ProviderKind;
  serverUrl: string;
  authMethod: AuthMethod;
  email?: string;
  username?: string;
  encryptedSecret: string;
  /** OAuth 2.0 refresh token (ciphertext). */
  encryptedRefreshToken?: string;
  /** When the access token stops working (ISO). Absent for non-expiring tokens (API tokens, PATs). */
  tokenExpiresAt?: string | null;
  oauth?: { tokenUrl: string; clientId: string; encryptedClientSecret?: string; scope?: string };
  lastRefreshAt?: string | null;
  lastRefreshError?: string | null;
  healthStatus: HealthStatus;
  healthMessage?: string;
  lastHealthCheckAt?: string | null;
  consecutiveFailures?: number;
  rateLimit?: { limit?: number; remaining?: number; resetAt?: string | null; updatedAt?: string };
  account: {
    accountId: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
  projectsOrSpaces: Array<{
    id: string;
    key: string;
    name: string;
    type?: string;
    description?: string;
  }>;
  connectedAt: string;
  lastSyncedAt: string | null;
}

export interface IntegrationConfigRecord {
  id: string;
  organizationId: string;
  connectionId: string;
  provider: AllProviderKind;
  name: string;
  targetProjectId: string;
  destinationModule: string;
  sourceScopes: string[];
  jqlOrCqlFilter?: string;
  syncMode: 'manual' | 'scheduled';
  syncIntervalMinutes: number;
  conflictPolicy: 'source_wins' | 'destination_wins' | 'manual_review';
  /** Push local edits of linked records back to the source system. */
  bidirectional?: boolean;
  lastCheckpointCursor?: string;
  lastSuccessfulSyncAt?: string | null;
  enabled: boolean;
  updatedAt: string;
}

export interface SavedMappingTemplateRecord {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  source: AllProviderKind;
  destinationModule: string;
  mappings: unknown[];
  statusMap: Record<string, string>;
  updatedAt: string;
}

export interface IntegrationJobItemRecord {
  id: string;
  jobId: string;
  externalEntityType: string;
  externalEntityId: string;
  externalKey: string;
  localEntityType?: string;
  localEntityId?: string;
  action: 'create' | 'update' | 'skip' | 'conflict' | 'fail' | 'missing_in_source' | 'push';
  status: 'pending' | 'succeeded' | 'failed' | 'conflict';
  rowNumber?: number;
  cellErrors?: Array<{
    rowIndex: number;
    columnKey: string;
    severity: 'error' | 'warning';
    messageEn: string;
    messageFa: string;
  }>;
  errorMessage?: string;
  payloadSnapshot?: Record<string, unknown>;
  syncHash?: string;
  sourceUpdatedAt?: string;
}

export interface IntegrationJobRecord {
  id: string;
  organizationId: string;
  createdByUserId: string;
  configId?: string;
  connectionId?: string;
  provider: AllProviderKind;
  mode: 'full' | 'incremental';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'partial' | 'failed' | 'cancelled';
  sourceLabel: string;
  targetSpaceKey: string;
  destinationModule: string;
  conflictPolicy: 'source_wins' | 'destination_wins' | 'manual_review';
  totalItems: number;
  processedItems: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  conflictCount: number;
  checkpointCursor?: string;
  workerLeaseOwner?: string;
  leaseExpiresAt?: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorSummary?: string;
  createdAt: string;
  pendingPayload?: {
    sourceScopes?: string[];
    jqlOrCql?: string;
    items?: Array<Record<string, unknown>>;
    statusMap?: Record<string, string>;
    mappings?: Array<Record<string, unknown>>;
    bidirectional?: boolean;
    /** Limit the run to these external ids (used by webhook driven refreshes). */
    onlyExternalIds?: string[];
  };
}

export interface IntegrationExternalLinkRecord {
  id: string;
  organizationId: string;
  provider: AllProviderKind;
  connectionId: string;
  externalEntityType: string;
  externalEntityId: string;
  externalKey: string;
  externalUrl?: string;
  localEntityType: string;
  localEntityId: string;
  localProjectId?: string;
  syncHash: string;
  sourceRevision?: string;
  sourceUpdatedAt?: string;
  localUpdatedAt?: string;
  missingInSource?: boolean;
  lastSyncedAt: string;
  /** Field values both systems agreed on at the last sync: the common ancestor for three-way merges. */
  base?: Record<string, unknown>;
  /** Local record version at the last sync (detects local edits). */
  localVersion?: number;
  /** Last error while pushing local changes to the source. */
  pushError?: string | null;
  /** Settings of the sync that created / last touched this link (used by push and webhook driven refreshes). */
  bidirectional?: boolean;
  conflictPolicy?: 'source_wins' | 'destination_wins' | 'manual_review';
  statusMap?: Record<string, string>;
  /** field -> hash of a (local, source) difference a person chose to ignore. */
  dismissed?: Record<string, string>;
}

export interface IntegrationConflictRecord {
  id: string;
  organizationId: string;
  jobId: string;
  configId?: string;
  externalLinkId?: string;
  provider: AllProviderKind;
  entityType: string;
  externalKey: string;
  localEntityId: string;
  fieldDiffs: Array<{
    field: string;
    sourceValue: unknown;
    localValue: unknown;
    baseValue?: unknown;
    chosen?: 'source' | 'destination';
  }>;
  sourceSnapshot: Record<string, unknown>;
  localSnapshot: Record<string, unknown>;
  /** Local record version when the conflict was detected; a newer local edit makes the conflict stale. */
  localVersion?: number;
  status: 'pending' | 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  createdAt: string;
}

export interface IntegrationAuditLogRecord {
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  provider: AllProviderKind | 'system';
  action: string;
  resourceType: string;
  resourceId?: string;
  status: 'success' | 'warning' | 'failed';
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SyncHistoryRecord {
  id: string;
  organizationId: string;
  userId: string;
  provider: AllProviderKind;
  status: 'success' | 'partial' | 'failed';
  sourceLabel: string;
  targetSpaceKey: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorMessage?: string;
  timestamp: string;
}

const nowIso = () => new Date().toISOString();
const rid = (prefix: string, n = 8) => `${prefix}-${crypto.randomUUID().slice(0, n)}`;

export type HealthListener = (previous: HealthStatus, conn: StoredConnectionRecord, actorId?: string) => void;

export interface RepoSyncState {
  repoId: string;
  status?: 'ok' | 'error' | 'running';
  lastAttemptAt?: string;
  lastSyncedAt?: string;
  error?: string | null;
  /** Provider features the token / plan cannot read (e.g. vulnerability alerts). */
  unavailable?: string[];
  counts?: Record<string, number>;
  defaultBranch?: string;
}

type DocKind = 'config' | 'template' | 'job' | 'jobitem' | 'conflict' | 'audit' | 'history' | 'reposync';

interface DocRow {
  data: string;
}

function parseRows<T>(rows: unknown[]): T[] {
  return (rows as DocRow[]).map(r => JSON.parse(r.data) as T);
}

class IntegrationStore {
  // ---- generic documents ------------------------------------------------
  private putDoc(kind: DocKind, id: string, orgId: string, data: unknown, opts: { ref?: string; status?: string; createdAt?: string } = {}): void {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO integ_docs (kind, id, org_id, ref, status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, id) DO UPDATE SET ref = excluded.ref, status = excluded.status, data = excluded.data, updated_at = excluded.updated_at`
    ).run(kind, id, orgId, opts.ref ?? null, opts.status ?? null, JSON.stringify(data), opts.createdAt || ts, ts);
  }

  private getDoc<T>(kind: DocKind, id: string): T | undefined {
    const row = db.prepare('SELECT data FROM integ_docs WHERE kind = ? AND id = ?').get(kind, id) as DocRow | undefined;
    return row ? (JSON.parse(row.data) as T) : undefined;
  }

  private listDocs<T>(kind: DocKind, orgId: string | null, order = 'created_at DESC', limit = 500, extra = '', params: Array<string | number> = []): T[] {
    const where = orgId === null ? 'kind = ?' : 'kind = ? AND org_id = ?';
    const args: Array<string | number> = orgId === null ? [kind] : [kind, orgId];
    return parseRows<T>(
      db.prepare(`SELECT data FROM integ_docs WHERE ${where} ${extra} ORDER BY ${order} LIMIT ${limit}`).all(...args, ...params)
    );
  }

  /** Keeps only the newest `keep` documents of a kind (audit log / history are capped). */
  private trim(kind: DocKind, keep: number): void {
    db.prepare(
      `DELETE FROM integ_docs WHERE kind = ? AND (kind, id) IN
         (SELECT kind, id FROM integ_docs WHERE kind = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?)`
    ).run(kind, kind, keep);
  }

  // ---- connections ------------------------------------------------------
  public summarizeConnection(conn: StoredConnectionRecord) {
    const maskedIdentity = conn.email
      ? conn.email.replace(/^(.)(.*)(@.*)$/, (_, a, mid, dom) => `${a}${'*'.repeat(Math.min(5, mid.length))}${dom}`)
      : conn.username
      ? `${conn.username.slice(0, 2)}***`
      : 'Token Configured';

    const dec = decryptSecret(conn.encryptedSecret);
    const effectiveHealthStatus: HealthStatus = dec.ok ? conn.healthStatus : 'needs_reauth';
    const expiresMs = conn.tokenExpiresAt ? Date.parse(conn.tokenExpiresAt) : NaN;

    return {
      id: conn.id,
      organizationId: conn.organizationId,
      provider: conn.provider,
      serverUrl: conn.serverUrl,
      authMethod: conn.authMethod,
      email: conn.email,
      username: conn.username,
      maskedIdentity,
      connected: dec.ok,
      healthStatus: effectiveHealthStatus,
      healthMessage: dec.ok ? conn.healthMessage : 'Stored credential cannot be decrypted. Please re-authenticate.',
      lastHealthCheckAt: conn.lastHealthCheckAt || null,
      account: conn.account,
      projectsOrSpaces: conn.projectsOrSpaces,
      connectedAt: conn.connectedAt,
      lastSyncedAt: conn.lastSyncedAt,
      tokenExpiresAt: conn.tokenExpiresAt || null,
      tokenExpired: Number.isFinite(expiresMs) ? expiresMs <= Date.now() : false,
      canRefreshToken: Boolean(conn.encryptedRefreshToken && conn.oauth),
      lastRefreshAt: conn.lastRefreshAt || null,
      lastRefreshError: conn.lastRefreshError || null,
      consecutiveFailures: conn.consecutiveFailures || 0,
      rateLimit: conn.rateLimit || null,
    };
  }

  private saveConnection(conn: StoredConnectionRecord): void {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO integ_connections (id, org_id, provider, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(conn.id, conn.organizationId, conn.provider, JSON.stringify(conn), conn.connectedAt || ts, ts);
  }

  public listAllConnections(): StoredConnectionRecord[] {
    return parseRows<StoredConnectionRecord>(db.prepare('SELECT data FROM integ_connections ORDER BY created_at').all());
  }

  public listConnections(orgId: string): StoredConnectionRecord[] {
    return parseRows<StoredConnectionRecord>(db.prepare('SELECT data FROM integ_connections WHERE org_id = ? ORDER BY created_at').all(orgId));
  }

  public getConnection(orgId: string, provider: ProviderKind): StoredConnectionRecord | undefined {
    const row = db.prepare('SELECT data FROM integ_connections WHERE org_id = ? AND provider = ?').get(orgId, provider) as DocRow | undefined;
    return row ? (JSON.parse(row.data) as StoredConnectionRecord) : undefined;
  }

  public getConnectionById(orgId: string, connId: string): StoredConnectionRecord | undefined {
    const row = db.prepare('SELECT data FROM integ_connections WHERE org_id = ? AND id = ?').get(orgId, connId) as DocRow | undefined;
    return row ? (JSON.parse(row.data) as StoredConnectionRecord) : undefined;
  }

  public getDecryptedSecret(conn: StoredConnectionRecord): { ok: boolean; secret?: string; needsReauth?: boolean } {
    const res = decryptSecret(conn.encryptedSecret);
    if (!res.ok) {
      conn.healthStatus = 'needs_reauth';
      conn.healthMessage = 'Stored credential requires re-authentication.';
      this.saveConnection(conn);
      return { ok: false, needsReauth: true };
    }
    return { ok: true, secret: res.value };
  }

  public getDecryptedRefreshToken(conn: StoredConnectionRecord): string | undefined {
    if (!conn.encryptedRefreshToken) return undefined;
    const res = decryptSecret(conn.encryptedRefreshToken);
    return res.ok ? res.value : undefined;
  }

  public getDecryptedClientSecret(conn: StoredConnectionRecord): string | undefined {
    if (!conn.oauth?.encryptedClientSecret) return undefined;
    const res = decryptSecret(conn.oauth.encryptedClientSecret);
    return res.ok ? res.value : undefined;
  }

  public upsertConnection(input: {
    organizationId: string;
    userId: string;
    provider: ProviderKind;
    serverUrl: string;
    authMethod: AuthMethod;
    email?: string;
    username?: string;
    plainSecret: string;
    refreshToken?: string;
    tokenExpiresAt?: string | null;
    oauth?: { tokenUrl: string; clientId: string; clientSecret?: string; scope?: string };
    account: StoredConnectionRecord['account'];
    projectsOrSpaces: StoredConnectionRecord['projectsOrSpaces'];
  }): StoredConnectionRecord {
    const existing = this.getConnection(input.organizationId, input.provider);
    const now = nowIso();
    const record: StoredConnectionRecord = {
      id: existing?.id || rid(`conn-${input.provider}`),
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      serverUrl: input.serverUrl.trim().replace(/\/+$/, ''),
      authMethod: input.authMethod,
      email: input.email?.trim(),
      username: input.username?.trim(),
      encryptedSecret: encryptSecret(input.plainSecret.trim()),
      encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken.trim()) : undefined,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      oauth: input.oauth
        ? {
            tokenUrl: input.oauth.tokenUrl,
            clientId: input.oauth.clientId,
            encryptedClientSecret: input.oauth.clientSecret ? encryptSecret(input.oauth.clientSecret) : undefined,
            scope: input.oauth.scope,
          }
        : undefined,
      lastRefreshAt: null,
      lastRefreshError: null,
      healthStatus: 'healthy',
      healthMessage: 'Connection verified',
      lastHealthCheckAt: now,
      consecutiveFailures: 0,
      account: input.account,
      projectsOrSpaces: input.projectsOrSpaces,
      connectedAt: existing?.connectedAt || now,
      lastSyncedAt: existing?.lastSyncedAt || null,
    };
    this.saveConnection(record);
    return record;
  }

  /** Persists a refreshed OAuth access (and rotated refresh) token. */
  public storeRefreshedToken(
    conn: StoredConnectionRecord,
    token: { accessToken: string; refreshToken?: string; expiresAt?: string | null }
  ): StoredConnectionRecord {
    const fresh = this.getConnectionById(conn.organizationId, conn.id) || conn;
    fresh.encryptedSecret = encryptSecret(token.accessToken);
    if (token.refreshToken) fresh.encryptedRefreshToken = encryptSecret(token.refreshToken);
    fresh.tokenExpiresAt = token.expiresAt ?? null;
    fresh.lastRefreshAt = nowIso();
    fresh.lastRefreshError = null;
    if (fresh.healthStatus === 'needs_reauth') {
      fresh.healthStatus = 'healthy';
      fresh.healthMessage = 'Access token refreshed';
    }
    this.saveConnection(fresh);
    return fresh;
  }

  public recordRefreshFailure(conn: StoredConnectionRecord, message: string, permanent: boolean): StoredConnectionRecord {
    const fresh = this.getConnectionById(conn.organizationId, conn.id) || conn;
    const previous = fresh.healthStatus;
    fresh.lastRefreshError = message.slice(0, 300);
    if (permanent) {
      fresh.healthStatus = 'needs_reauth';
      fresh.healthMessage = 'The refresh token was rejected. Please re-authenticate.';
    }
    this.saveConnection(fresh);
    this.announceHealth(previous, fresh);
    return fresh;
  }

  public updateConnectionHealth(
    orgId: string,
    provider: ProviderKind,
    healthStatus: HealthStatus,
    healthMessage?: string
  ): StoredConnectionRecord | undefined {
    const conn = this.getConnection(orgId, provider);
    if (!conn) return undefined;
    return this.updateConnectionHealthById(conn, healthStatus, healthMessage);
  }

  public updateConnectionHealthById(conn: StoredConnectionRecord, healthStatus: HealthStatus, healthMessage?: string): StoredConnectionRecord {
    const fresh = this.getConnectionById(conn.organizationId, conn.id) || conn;
    const previous = fresh.healthStatus;
    fresh.healthStatus = healthStatus;
    fresh.healthMessage = healthMessage;
    fresh.lastHealthCheckAt = nowIso();
    fresh.consecutiveFailures = healthStatus === 'healthy' ? 0 : (fresh.consecutiveFailures || 0) + 1;
    this.saveConnection(fresh);
    this.announceHealth(previous, fresh);
    return fresh;
  }

  private healthListener: HealthListener | null = null;

  /** Told about every status change, whichever code path noticed it (check, sync job, token refresh). */
  public onHealthChange(listener: HealthListener): void {
    this.healthListener = listener;
  }

  private announceHealth(previous: HealthStatus, conn: StoredConnectionRecord, actorId?: string): void {
    if (previous === conn.healthStatus || !this.healthListener) return;
    this.healthListener(previous, conn, actorId);
  }

  public updateConnectionRateLimit(connId: string, orgId: string, rl: NonNullable<StoredConnectionRecord['rateLimit']>): void {
    const conn = this.getConnectionById(orgId, connId);
    if (!conn) return;
    conn.rateLimit = { ...rl, updatedAt: nowIso() };
    this.saveConnection(conn);
  }

  public markConnectionSynced(orgId: string, provider: ProviderKind, timestamp: string): void {
    const conn = this.getConnection(orgId, provider);
    if (!conn) return;
    conn.lastSyncedAt = timestamp;
    this.saveConnection(conn);
  }

  public deleteConnection(orgId: string, provider: ProviderKind): boolean {
    const res = db.prepare('DELETE FROM integ_connections WHERE org_id = ? AND provider = ?').run(orgId, provider);
    return Number(res.changes) > 0;
  }

  // ---- health history -----------------------------------------------------
  public appendHealthCheck(orgId: string, connectionId: string, entry: { status: HealthStatus; latencyMs?: number; message?: string; detail?: unknown }): void {
    db.prepare('INSERT INTO integ_health (org_id, connection_id, ts, status, latency_ms, message, detail) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      orgId,
      connectionId,
      nowIso(),
      entry.status,
      entry.latencyMs ?? null,
      entry.message?.slice(0, 300) ?? null,
      entry.detail === undefined ? null : JSON.stringify(scrubSensitiveMetadata(entry.detail))
    );
    db.prepare(
      'DELETE FROM integ_health WHERE connection_id = ? AND id NOT IN (SELECT id FROM integ_health WHERE connection_id = ? ORDER BY id DESC LIMIT 200)'
    ).run(connectionId, connectionId);
  }

  public listHealthChecks(orgId: string, connectionId: string, limit = 50) {
    return (
      db
        .prepare('SELECT ts, status, latency_ms, message, detail FROM integ_health WHERE org_id = ? AND connection_id = ? ORDER BY id DESC LIMIT ?')
        .all(orgId, connectionId, Math.min(limit, 200)) as Array<{ ts: string; status: string; latency_ms: number | null; message: string | null; detail: string | null }>
    ).map(r => ({
      ts: r.ts,
      status: r.status as HealthStatus,
      latencyMs: r.latency_ms,
      message: r.message,
      detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
    }));
  }

  // ---- per-repository source control sync state --------------------------------
  public getRepoSyncState(repoId: string): RepoSyncState | undefined {
    return this.getDoc<RepoSyncState>('reposync', repoId);
  }

  public setRepoSyncState(orgId: string, repoId: string, patch: Partial<RepoSyncState>): RepoSyncState {
    const next: RepoSyncState = { ...(this.getRepoSyncState(repoId) || { repoId }), ...patch, repoId };
    this.putDoc('reposync', repoId, orgId, next);
    return next;
  }

  // ---- configs --------------------------------------------------------------
  public listConfigs(orgId: string): IntegrationConfigRecord[] {
    return this.listDocs<IntegrationConfigRecord>('config', orgId);
  }

  public listAllEnabledScheduledConfigs(): IntegrationConfigRecord[] {
    return this.listDocs<IntegrationConfigRecord>('config', null, 'created_at DESC', 1000).filter(c => c.enabled && c.syncMode === 'scheduled');
  }

  public getConfig(orgId: string, configId: string): IntegrationConfigRecord | undefined {
    const c = this.getDoc<IntegrationConfigRecord>('config', configId);
    return c && c.organizationId === orgId ? c : undefined;
  }

  public upsertConfig(input: Omit<IntegrationConfigRecord, 'id' | 'updatedAt'> & { id?: string }): IntegrationConfigRecord {
    const existing = input.id ? this.getConfig(input.organizationId, input.id) : undefined;
    const record: IntegrationConfigRecord = {
      id: existing?.id || rid('cfg'),
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      provider: input.provider,
      name: input.name.trim().slice(0, 140),
      targetProjectId: input.targetProjectId,
      destinationModule: input.destinationModule,
      sourceScopes: Array.isArray(input.sourceScopes) ? input.sourceScopes : [],
      jqlOrCqlFilter: input.jqlOrCqlFilter,
      syncMode: input.syncMode === 'scheduled' ? 'scheduled' : 'manual',
      syncIntervalMinutes: Math.max(5, Number(input.syncIntervalMinutes || 60)),
      conflictPolicy: input.conflictPolicy || 'manual_review',
      bidirectional: input.bidirectional ?? existing?.bidirectional ?? false,
      lastCheckpointCursor: input.lastCheckpointCursor ?? existing?.lastCheckpointCursor,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? existing?.lastSuccessfulSyncAt ?? null,
      enabled: input.enabled ?? true,
      updatedAt: nowIso(),
    };
    this.putDoc('config', record.id, record.organizationId, record, { createdAt: existing ? undefined : nowIso() });
    return record;
  }

  public deleteConfig(orgId: string, configId: string): boolean {
    const res = db.prepare("DELETE FROM integ_docs WHERE kind = 'config' AND id = ? AND org_id = ?").run(configId, orgId);
    return Number(res.changes) > 0;
  }

  // ---- templates --------------------------------------------------------------
  public listTemplates(orgId: string): SavedMappingTemplateRecord[] {
    return this.listDocs<SavedMappingTemplateRecord>('template', orgId);
  }

  public saveTemplate(input: {
    organizationId: string;
    userId: string;
    name: string;
    source: AllProviderKind;
    destinationModule: string;
    mappings: unknown[];
    statusMap: Record<string, string>;
  }): SavedMappingTemplateRecord {
    const tpl: SavedMappingTemplateRecord = {
      id: rid('tpl'),
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name.trim().slice(0, 120),
      source: input.source,
      destinationModule: input.destinationModule,
      mappings: input.mappings,
      statusMap: input.statusMap || {},
      updatedAt: nowIso(),
    };
    this.putDoc('template', tpl.id, tpl.organizationId, tpl);
    return tpl;
  }

  public deleteTemplate(orgId: string, templateId: string): void {
    db.prepare("DELETE FROM integ_docs WHERE kind = 'template' AND id = ? AND org_id = ?").run(templateId, orgId);
  }

  // ---- jobs & job items ---------------------------------------------------------
  private stripPayload(j: IntegrationJobRecord): IntegrationJobRecord {
    const { pendingPayload: _omit, ...safeJob } = j;
    void _omit;
    return safeJob;
  }

  public listJobs(orgId: string): IntegrationJobRecord[] {
    return this.listDocs<IntegrationJobRecord>('job', orgId, 'created_at DESC', 60).map(j => this.stripPayload(j));
  }

  public listJobsForConfig(orgId: string, configId: string): IntegrationJobRecord[] {
    return this.listDocs<IntegrationJobRecord>('job', orgId, 'created_at DESC', 20, 'AND ref = ?', [configId]).map(j => this.stripPayload(j));
  }

  public getJob(orgId: string, jobId: string): (IntegrationJobRecord & { items: IntegrationJobItemRecord[] }) | undefined {
    const job = this.getDoc<IntegrationJobRecord>('job', jobId);
    if (!job || job.organizationId !== orgId) return undefined;
    return { ...this.stripPayload(job), items: this.getJobItems(jobId) };
  }

  public getRawJobById(jobId: string): IntegrationJobRecord | undefined {
    return this.getDoc<IntegrationJobRecord>('job', jobId);
  }

  public getRecoverableJobs(): IntegrationJobRecord[] {
    return parseRows<IntegrationJobRecord>(
      db.prepare("SELECT data FROM integ_docs WHERE kind = 'job' AND status IN ('queued','running')").all()
    );
  }

  public createJob(input: {
    organizationId: string;
    createdByUserId: string;
    configId?: string;
    connectionId?: string;
    provider: AllProviderKind;
    mode: 'full' | 'incremental';
    sourceLabel: string;
    targetSpaceKey: string;
    destinationModule: string;
    conflictPolicy?: 'source_wins' | 'destination_wins' | 'manual_review';
    totalItems?: number;
    pendingPayload?: IntegrationJobRecord['pendingPayload'];
  }): IntegrationJobRecord {
    const job: IntegrationJobRecord = {
      id: rid('job', 10),
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      configId: input.configId,
      connectionId: input.connectionId,
      provider: input.provider,
      mode: input.mode,
      status: 'queued',
      sourceLabel: input.sourceLabel.slice(0, 180),
      targetSpaceKey: input.targetSpaceKey.slice(0, 32),
      destinationModule: input.destinationModule,
      conflictPolicy: input.conflictPolicy || 'manual_review',
      totalItems: input.totalItems || 0,
      processedItems: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      conflictCount: 0,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: nowIso(),
      pendingPayload: input.pendingPayload,
    };
    this.putDoc('job', job.id, job.organizationId, job, { ref: job.configId, status: job.status, createdAt: job.createdAt });
    this.trim('job', 300);
    return job;
  }

  public updateJob(jobId: string, patch: Partial<IntegrationJobRecord>): IntegrationJobRecord | undefined {
    const job = this.getRawJobById(jobId);
    if (!job) return undefined;
    Object.assign(job, patch);
    this.putDoc('job', job.id, job.organizationId, job, { ref: job.configId, status: job.status, createdAt: job.createdAt });
    return job;
  }

  public addOrUpdateJobItem(item: IntegrationJobItemRecord): void {
    const id = `${item.jobId}:${item.externalEntityType}:${item.externalEntityId}`;
    const job = this.getRawJobById(item.jobId);
    this.putDoc('jobitem', id, job?.organizationId || 'unknown', { ...item, id }, { ref: item.jobId });
  }

  public getJobItems(jobId: string): IntegrationJobItemRecord[] {
    return parseRows<IntegrationJobItemRecord>(
      db.prepare("SELECT data FROM integ_docs WHERE kind = 'jobitem' AND ref = ? ORDER BY created_at LIMIT 1000").all(jobId)
    );
  }

  // ---- external links ---------------------------------------------------------------
  private linkFromRow(r: { data: string; missing: number; id: string }): IntegrationExternalLinkRecord {
    const link = JSON.parse(r.data) as IntegrationExternalLinkRecord;
    link.id = r.id;
    link.missingInSource = Boolean(r.missing);
    return link;
  }

  public listExternalLinks(orgId: string, provider?: AllProviderKind): IntegrationExternalLinkRecord[] {
    const rows = provider
      ? db.prepare('SELECT id, data, missing FROM integ_links WHERE org_id = ? AND provider = ? ORDER BY updated_at DESC LIMIT 5000').all(orgId, provider)
      : db.prepare('SELECT id, data, missing FROM integ_links WHERE org_id = ? ORDER BY updated_at DESC LIMIT 5000').all(orgId);
    return (rows as Array<{ id: string; data: string; missing: number }>).map(r => this.linkFromRow(r));
  }

  public findExternalLink(
    orgId: string,
    provider: AllProviderKind,
    connectionId: string,
    externalEntityType: string,
    externalEntityId: string
  ): IntegrationExternalLinkRecord | undefined {
    const row = db
      .prepare('SELECT id, data, missing FROM integ_links WHERE org_id = ? AND provider = ? AND connection_id = ? AND ext_type = ? AND ext_id = ?')
      .get(orgId, provider, connectionId, externalEntityType, externalEntityId) as { id: string; data: string; missing: number } | undefined;
    return row ? this.linkFromRow(row) : undefined;
  }

  public findExternalLinkByLocal(orgId: string, localEntityType: string, localEntityId: string): IntegrationExternalLinkRecord | undefined {
    const row = db
      .prepare('SELECT id, data, missing FROM integ_links WHERE org_id = ? AND local_type = ? AND local_id = ? LIMIT 1')
      .get(orgId, localEntityType, localEntityId) as { id: string; data: string; missing: number } | undefined;
    return row ? this.linkFromRow(row) : undefined;
  }

  public getExternalLink(orgId: string, linkId: string): IntegrationExternalLinkRecord | undefined {
    const row = db.prepare('SELECT id, data, missing FROM integ_links WHERE org_id = ? AND id = ?').get(orgId, linkId) as
      | { id: string; data: string; missing: number }
      | undefined;
    return row ? this.linkFromRow(row) : undefined;
  }

  public upsertExternalLink(input: Omit<IntegrationExternalLinkRecord, 'id' | 'lastSyncedAt'>): IntegrationExternalLinkRecord {
    const existing = this.findExternalLink(
      input.organizationId,
      input.provider,
      input.connectionId,
      input.externalEntityType,
      input.externalEntityId
    );
    const record: IntegrationExternalLinkRecord = {
      ...(existing || {}),
      id: existing?.id || rid('link', 10),
      ...input,
      base: input.base ?? existing?.base,
      localVersion: input.localVersion ?? existing?.localVersion,
      missingInSource: input.missingInSource ?? false,
      lastSyncedAt: nowIso(),
    } as IntegrationExternalLinkRecord;
    db.prepare(
      `INSERT INTO integ_links (id, org_id, provider, connection_id, ext_type, ext_id, local_type, local_id, project_id, missing, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET local_type = excluded.local_type, local_id = excluded.local_id, project_id = excluded.project_id,
         missing = excluded.missing, data = excluded.data, updated_at = excluded.updated_at`
    ).run(
      record.id,
      record.organizationId,
      record.provider,
      record.connectionId,
      record.externalEntityType,
      record.externalEntityId,
      record.localEntityType,
      record.localEntityId,
      record.localProjectId ?? null,
      record.missingInSource ? 1 : 0,
      JSON.stringify(record),
      record.lastSyncedAt
    );
    return record;
  }

  /** Partial update that does not touch lastSyncedAt semantics (e.g. record a push error). */
  public patchExternalLink(orgId: string, linkId: string, patch: Partial<IntegrationExternalLinkRecord>): IntegrationExternalLinkRecord | undefined {
    const link = this.getExternalLink(orgId, linkId);
    if (!link) return undefined;
    const next = { ...link, ...patch, id: link.id };
    db.prepare('UPDATE integ_links SET data = ?, missing = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(next),
      next.missingInSource ? 1 : 0,
      nowIso(),
      link.id
    );
    return next;
  }

  public flagMissingInSource(
    orgId: string,
    provider: AllProviderKind,
    connectionId: string,
    externalEntityType: string,
    seenExternalIds: Set<string>,
    projectFilter?: string
  ): IntegrationExternalLinkRecord[] {
    const flagged: IntegrationExternalLinkRecord[] = [];
    for (const link of this.listExternalLinks(orgId, provider)) {
      if (
        link.connectionId === connectionId &&
        link.externalEntityType === externalEntityType &&
        (!projectFilter || link.localProjectId === projectFilter) &&
        !seenExternalIds.has(link.externalEntityId) &&
        !link.missingInSource
      ) {
        this.patchExternalLink(orgId, link.id, { missingInSource: true });
        flagged.push({ ...link, missingInSource: true });
      }
    }
    return flagged;
  }

  // ---- conflicts ---------------------------------------------------------------------
  public listConflicts(orgId: string, status?: string): IntegrationConflictRecord[] {
    return status
      ? this.listDocs<IntegrationConflictRecord>('conflict', orgId, 'created_at DESC', 500, 'AND status = ?', [status])
      : this.listDocs<IntegrationConflictRecord>('conflict', orgId, 'created_at DESC', 500);
  }

  public getConflict(orgId: string, conflictId: string): IntegrationConflictRecord | undefined {
    const c = this.getDoc<IntegrationConflictRecord>('conflict', conflictId);
    return c && c.organizationId === orgId ? c : undefined;
  }

  public findPendingConflictForLink(orgId: string, linkId: string): IntegrationConflictRecord | undefined {
    return this.listConflicts(orgId, 'pending').find(c => c.externalLinkId === linkId);
  }

  public createConflict(input: Omit<IntegrationConflictRecord, 'id' | 'status' | 'createdAt'>): IntegrationConflictRecord {
    const conflict: IntegrationConflictRecord = { id: rid('conf', 9), ...input, status: 'pending', createdAt: nowIso() };
    this.putDoc('conflict', conflict.id, conflict.organizationId, conflict, { status: 'pending', createdAt: conflict.createdAt });
    this.trim('conflict', 1000);
    return conflict;
  }

  /** Replaces the diff of a still-pending conflict (a newer sync saw newer values). */
  public refreshConflict(conflict: IntegrationConflictRecord, patch: Partial<IntegrationConflictRecord>): IntegrationConflictRecord {
    const next = { ...conflict, ...patch };
    this.putDoc('conflict', next.id, next.organizationId, next, { status: next.status, createdAt: next.createdAt });
    return next;
  }

  public resolveConflict(
    orgId: string,
    conflictId: string,
    resolution: 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed',
    resolvedBy: string,
    mergedFields?: Record<string, 'source' | 'destination'>,
    note?: string
  ): IntegrationConflictRecord | undefined {
    const conflict = this.getConflict(orgId, conflictId);
    if (!conflict) return undefined;
    conflict.status = resolution;
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = nowIso();
    if (note) conflict.resolutionNote = note.slice(0, 500);
    conflict.fieldDiffs = conflict.fieldDiffs.map(d => ({
      ...d,
      chosen:
        resolution === 'resolved_merged'
          ? mergedFields?.[d.field] || 'destination'
          : resolution === 'resolved_source'
          ? 'source'
          : resolution === 'resolved_destination'
          ? 'destination'
          : d.chosen,
    }));
    this.putDoc('conflict', conflict.id, conflict.organizationId, conflict, { status: resolution, createdAt: conflict.createdAt });
    return conflict;
  }

  // ---- audit logs ----------------------------------------------------------------------
  public listAuditLogs(orgId: string, provider?: string): IntegrationAuditLogRecord[] {
    const logs = this.listDocs<IntegrationAuditLogRecord>('audit', orgId, 'created_at DESC', 600);
    return logs.filter(a => !provider || provider === 'all' || a.provider === provider).slice(0, 200);
  }

  public appendAuditLog(input: Omit<IntegrationAuditLogRecord, 'id' | 'createdAt'>): IntegrationAuditLogRecord {
    const entry: IntegrationAuditLogRecord = {
      id: rid('audit', 10),
      ...input,
      metadata: scrubSensitiveMetadata(input.metadata),
      createdAt: nowIso(),
    };
    this.putDoc('audit', entry.id, entry.organizationId, entry, { createdAt: entry.createdAt });
    if (Math.random() < 0.05) this.trim('audit', 3000);
    return entry;
  }

  // ---- history ----------------------------------------------------------------------------
  public listHistory(orgId: string): SyncHistoryRecord[] {
    return this.listDocs<SyncHistoryRecord>('history', orgId, 'created_at DESC', 80);
  }

  public appendHistory(input: Omit<SyncHistoryRecord, 'id' | 'timestamp'>): SyncHistoryRecord {
    const rec: SyncHistoryRecord = { id: rid('sync'), ...input, timestamp: nowIso() };
    this.putDoc('history', rec.id, rec.organizationId, rec, { createdAt: rec.timestamp });
    if (Math.random() < 0.05) this.trim('history', 600);
    return rec;
  }

  // ---- legacy import -----------------------------------------------------------------------
  /**
   * One-time import of the pre-P3 JSON file store (.data/integration-db.json). Credentials in that file were
   * encrypted with a process-lifetime key, so they cannot be decrypted any more and the connection shows as
   * "needs re-authentication"; everything else (configs, jobs, links, conflicts, audit, history) is kept.
   */
  public importLegacyJsonStore(): { imported: boolean; counts?: Record<string, number> } {
    if (getMeta('integ_legacy_imported')) return { imported: false };
    const dbPath = process.env.JIRAFLOW_DB_PATH;
    if (dbPath === ':memory:') return { imported: false };
    const file = path.join(dbPath ? path.dirname(path.resolve(dbPath)) : path.resolve(process.cwd(), '.data'), 'integration-db.json');
    if (!fs.existsSync(file)) {
      setMeta('integ_legacy_imported', 'none');
      return { imported: false };
    }
    let legacy: Record<string, unknown[]>;
    try {
      legacy = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown[]>;
    } catch {
      setMeta('integ_legacy_imported', 'unreadable');
      return { imported: false };
    }
    const counts: Record<string, number> = {};
    transaction(() => {
      const arr = <T>(k: string): T[] => (Array.isArray(legacy[k]) ? (legacy[k] as T[]) : []);
      for (const c of arr<StoredConnectionRecord>('connections')) {
        if (c.provider === 'jira' || c.provider === 'confluence') this.saveConnection({ ...c, consecutiveFailures: 0 });
      }
      for (const c of arr<IntegrationConfigRecord>('configs')) this.putDoc('config', c.id, c.organizationId, c, { createdAt: c.updatedAt });
      for (const t of arr<SavedMappingTemplateRecord>('templates')) this.putDoc('template', t.id, t.organizationId, t, { createdAt: t.updatedAt });
      for (const j of arr<IntegrationJobRecord>('jobs')) {
        // jobs that were mid-flight when the old server stopped must not restart against stale state
        const status = j.status === 'queued' || j.status === 'running' ? 'cancelled' : j.status;
        this.putDoc('job', j.id, j.organizationId, { ...j, status }, { ref: j.configId, status, createdAt: j.createdAt });
      }
      for (const it of arr<IntegrationJobItemRecord>('jobItems')) {
        const job = arr<IntegrationJobRecord>('jobs').find(j => j.id === it.jobId);
        this.putDoc('jobitem', `${it.jobId}:${it.externalEntityType}:${it.externalEntityId}`, job?.organizationId || 'unknown', it, { ref: it.jobId });
      }
      for (const l of arr<IntegrationExternalLinkRecord>('externalLinks')) {
        const { id: _id, lastSyncedAt: _ls, ...rest } = l;
        void _id;
        void _ls;
        this.upsertExternalLink(rest);
      }
      for (const c of arr<IntegrationConflictRecord>('conflicts')) this.putDoc('conflict', c.id, c.organizationId, c, { status: c.status, createdAt: c.createdAt });
      for (const a of arr<IntegrationAuditLogRecord>('auditLogs')) this.putDoc('audit', a.id, a.organizationId, a, { createdAt: a.createdAt });
      for (const h of arr<SyncHistoryRecord>('history')) this.putDoc('history', h.id, h.organizationId, h, { createdAt: h.timestamp });
      for (const k of ['connections', 'configs', 'templates', 'jobs', 'jobItems', 'externalLinks', 'conflicts', 'auditLogs', 'history']) {
        counts[k] = arr(k).length;
      }
      setMeta('integ_legacy_imported', nowIso());
    });
    try {
      fs.renameSync(file, `${file}.migrated`);
    } catch {
      /* keep the file if it cannot be renamed; the meta flag prevents a second import */
    }
    return { imported: true, counts };
  }
}

export const integrationStore = new IntegrationStore();
