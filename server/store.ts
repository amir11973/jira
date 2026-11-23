import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthMethod } from './httpClient.ts';
import { encryptSecret, decryptSecret, scrubSensitiveMetadata } from './cryptoVault.ts';

export type ProviderKind = 'jira' | 'confluence';
export type AllProviderKind = 'jira' | 'confluence' | 'excel';

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
  healthStatus: 'healthy' | 'degraded' | 'unreachable' | 'needs_reauth';
  healthMessage?: string;
  lastHealthCheckAt?: string | null;
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
  action: 'create' | 'update' | 'skip' | 'conflict' | 'fail' | 'missing_in_source';
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
    chosen?: 'source' | 'destination';
  }>;
  sourceSnapshot: Record<string, unknown>;
  localSnapshot: Record<string, unknown>;
  status: 'pending' | 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed';
  resolvedBy?: string;
  resolvedAt?: string;
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

interface IntegrationDatabaseState {
  version: number;
  connections: StoredConnectionRecord[];
  configs: IntegrationConfigRecord[];
  templates: SavedMappingTemplateRecord[];
  jobs: IntegrationJobRecord[];
  jobItems: IntegrationJobItemRecord[];
  externalLinks: IntegrationExternalLinkRecord[];
  conflicts: IntegrationConflictRecord[];
  auditLogs: IntegrationAuditLogRecord[];
  history: SyncHistoryRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'integration-db.json');

const DEFAULT_DB: IntegrationDatabaseState = {
  version: 2,
  connections: [],
  configs: [],
  templates: [],
  jobs: [],
  jobItems: [],
  externalLinks: [],
  conflicts: [],
  auditLogs: [],
  history: [],
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStateFromDisk(): IntegrationDatabaseState {
  try {
    ensureDataDir();
    if (!fs.existsSync(DB_FILE)) {
      return structuredClone(DEFAULT_DB);
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    if (!raw.trim()) return structuredClone(DEFAULT_DB);
    const parsed = JSON.parse(raw) as Partial<IntegrationDatabaseState>;
    return {
      version: parsed.version || 2,
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
      configs: Array.isArray(parsed.configs) ? parsed.configs : [],
      templates: Array.isArray(parsed.templates) ? parsed.templates : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      jobItems: Array.isArray(parsed.jobItems) ? parsed.jobItems : [],
      externalLinks: Array.isArray(parsed.externalLinks) ? parsed.externalLinks : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

class IntegrationStore {
  private state: IntegrationDatabaseState;

  constructor() {
    this.state = loadStateFromDisk();
  }

  private persist(): void {
    try {
      ensureDataDir();
      const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.state, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('[IntegrationStore] Failed to persist state:', err);
    }
  }

  public summarizeConnection(conn: StoredConnectionRecord) {
    const maskedIdentity = conn.email
      ? conn.email.replace(/^(.)(.*)(@.*)$/, (_, a, mid, dom) => `${a}${'*'.repeat(Math.min(5, mid.length))}${dom}`)
      : conn.username
      ? `${conn.username.slice(0, 2)}***`
      : 'Token Configured';

    const dec = decryptSecret(conn.encryptedSecret);
    const effectiveHealthStatus = dec.ok ? conn.healthStatus : 'needs_reauth';

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
      healthMessage: dec.ok
        ? conn.healthMessage
        : 'Stored credential key rotated on server restart. Please re-authenticate.',
      lastHealthCheckAt: conn.lastHealthCheckAt || null,
      account: conn.account,
      projectsOrSpaces: conn.projectsOrSpaces,
      connectedAt: conn.connectedAt,
      lastSyncedAt: conn.lastSyncedAt,
    };
  }

  public getConnection(orgId: string, provider: ProviderKind): StoredConnectionRecord | undefined {
    return this.state.connections.find(c => c.organizationId === orgId && c.provider === provider);
  }

  public getConnectionById(orgId: string, connId: string): StoredConnectionRecord | undefined {
    return this.state.connections.find(c => c.organizationId === orgId && c.id === connId);
  }

  public getDecryptedSecret(conn: StoredConnectionRecord): { ok: boolean; secret?: string; needsReauth?: boolean } {
    const res = decryptSecret(conn.encryptedSecret);
    if (!res.ok) {
      conn.healthStatus = 'needs_reauth';
      conn.healthMessage = 'Stored credential requires re-authentication.';
      this.persist();
      return { ok: false, needsReauth: true };
    }
    return { ok: true, secret: res.value };
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
    account: StoredConnectionRecord['account'];
    projectsOrSpaces: StoredConnectionRecord['projectsOrSpaces'];
  }): StoredConnectionRecord {
    const existing = this.getConnection(input.organizationId, input.provider);
    const now = new Date().toISOString();
    const record: StoredConnectionRecord = {
      id: existing?.id || `conn-${input.provider}-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: input.organizationId,
      userId: input.userId,
      provider: input.provider,
      serverUrl: input.serverUrl.trim().replace(/\/+$/, ''),
      authMethod: input.authMethod,
      email: input.email?.trim(),
      username: input.username?.trim(),
      encryptedSecret: encryptSecret(input.plainSecret.trim()),
      healthStatus: 'healthy',
      healthMessage: 'Connection verified',
      lastHealthCheckAt: now,
      account: input.account,
      projectsOrSpaces: input.projectsOrSpaces,
      connectedAt: existing?.connectedAt || now,
      lastSyncedAt: existing?.lastSyncedAt || null,
    };

    this.state.connections = [
      record,
      ...this.state.connections.filter(
        c => !(c.organizationId === input.organizationId && c.provider === input.provider)
      ),
    ];
    this.persist();
    return record;
  }

  public updateConnectionHealth(
    orgId: string,
    provider: ProviderKind,
    healthStatus: StoredConnectionRecord['healthStatus'],
    healthMessage?: string
  ): StoredConnectionRecord | undefined {
    const conn = this.getConnection(orgId, provider);
    if (!conn) return undefined;
    conn.healthStatus = healthStatus;
    conn.healthMessage = healthMessage;
    conn.lastHealthCheckAt = new Date().toISOString();
    this.persist();
    return conn;
  }

  public markConnectionSynced(orgId: string, provider: ProviderKind, timestamp: string): void {
    const conn = this.getConnection(orgId, provider);
    if (!conn) return;
    conn.lastSyncedAt = timestamp;
    this.persist();
  }

  public deleteConnection(orgId: string, provider: ProviderKind): boolean {
    const before = this.state.connections.length;
    this.state.connections = this.state.connections.filter(
      c => !(c.organizationId === orgId && c.provider === provider)
    );
    if (this.state.connections.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  // ---- Configs ----
  public listConfigs(orgId: string): IntegrationConfigRecord[] {
    return this.state.configs.filter(c => c.organizationId === orgId);
  }

  public listAllEnabledScheduledConfigs(): IntegrationConfigRecord[] {
    return this.state.configs.filter(c => c.enabled && c.syncMode === 'scheduled');
  }

  public getConfig(orgId: string, configId: string): IntegrationConfigRecord | undefined {
    return this.state.configs.find(c => c.organizationId === orgId && c.id === configId);
  }

  public upsertConfig(input: Omit<IntegrationConfigRecord, 'id' | 'updatedAt'> & { id?: string }): IntegrationConfigRecord {
    const now = new Date().toISOString();
    const existing = input.id
      ? this.state.configs.find(c => c.id === input.id && c.organizationId === input.organizationId)
      : undefined;

    const record: IntegrationConfigRecord = {
      id: existing?.id || `cfg-${crypto.randomUUID().slice(0, 8)}`,
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
      lastCheckpointCursor: input.lastCheckpointCursor ?? existing?.lastCheckpointCursor,
      lastSuccessfulSyncAt: input.lastSuccessfulSyncAt ?? existing?.lastSuccessfulSyncAt ?? null,
      enabled: input.enabled ?? true,
      updatedAt: now,
    };

    this.state.configs = [
      record,
      ...this.state.configs.filter(c => c.id !== record.id),
    ];
    this.persist();
    return record;
  }

  public deleteConfig(orgId: string, configId: string): boolean {
    const before = this.state.configs.length;
    this.state.configs = this.state.configs.filter(
      c => !(c.organizationId === orgId && c.id === configId)
    );
    if (this.state.configs.length !== before) {
      this.persist();
      return true;
    }
    return false;
  }

  // ---- Templates ----
  public listTemplates(orgId: string): SavedMappingTemplateRecord[] {
    return this.state.templates.filter(t => t.organizationId === orgId);
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
      id: `tpl-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: input.organizationId,
      userId: input.userId,
      name: input.name.trim().slice(0, 120),
      source: input.source,
      destinationModule: input.destinationModule,
      mappings: input.mappings,
      statusMap: input.statusMap || {},
      updatedAt: new Date().toISOString(),
    };
    this.state.templates = [tpl, ...this.state.templates].slice(0, 100);
    this.persist();
    return tpl;
  }

  public deleteTemplate(orgId: string, templateId: string): void {
    this.state.templates = this.state.templates.filter(
      t => !(t.organizationId === orgId && t.id === templateId)
    );
    this.persist();
  }

  // ---- Jobs & Job Items ----
  public listJobs(orgId: string): IntegrationJobRecord[] {
    return this.state.jobs
      .filter(j => j.organizationId === orgId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 60)
      .map(j => {
        const { pendingPayload: _omit, ...safeJob } = j;
        void _omit;
        return safeJob;
      });
  }

  public getJob(orgId: string, jobId: string): (IntegrationJobRecord & { items: IntegrationJobItemRecord[] }) | undefined {
    const job = this.state.jobs.find(j => j.organizationId === orgId && j.id === jobId);
    if (!job) return undefined;
    const { pendingPayload: _omit, ...safeJob } = job;
    void _omit;
    const items = this.state.jobItems.filter(it => it.jobId === jobId);
    return { ...safeJob, items };
  }

  public getRawJobById(jobId: string): IntegrationJobRecord | undefined {
    return this.state.jobs.find(j => j.id === jobId);
  }

  public getRecoverableJobs(): IntegrationJobRecord[] {
    return this.state.jobs.filter(j => j.status === 'queued' || j.status === 'running');
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
      id: `job-${crypto.randomUUID().slice(0, 10)}`,
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
      createdAt: new Date().toISOString(),
      pendingPayload: input.pendingPayload,
    };

    this.state.jobs = [job, ...this.state.jobs].slice(0, 150);
    this.persist();
    return job;
  }

  public updateJob(jobId: string, patch: Partial<IntegrationJobRecord>): IntegrationJobRecord | undefined {
    const job = this.state.jobs.find(j => j.id === jobId);
    if (!job) return undefined;
    Object.assign(job, patch);
    this.persist();
    return job;
  }

  public addOrUpdateJobItem(item: IntegrationJobItemRecord): void {
    const idx = this.state.jobItems.findIndex(
      x => x.jobId === item.jobId && x.externalEntityId === item.externalEntityId && x.externalEntityType === item.externalEntityType
    );
    if (idx >= 0) {
      this.state.jobItems[idx] = item;
    } else {
      this.state.jobItems.unshift(item);
      if (this.state.jobItems.length > 2500) {
        this.state.jobItems = this.state.jobItems.slice(0, 2500);
      }
    }
    this.persist();
  }

  public getJobItems(jobId: string): IntegrationJobItemRecord[] {
    return this.state.jobItems.filter(it => it.jobId === jobId);
  }

  // ---- External Links (Unique Composite Key) ----
  public listExternalLinks(orgId: string, provider?: AllProviderKind): IntegrationExternalLinkRecord[] {
    return this.state.externalLinks.filter(
      l => l.organizationId === orgId && (!provider || l.provider === provider)
    );
  }

  public findExternalLink(
    orgId: string,
    provider: AllProviderKind,
    connectionId: string,
    externalEntityType: string,
    externalEntityId: string
  ): IntegrationExternalLinkRecord | undefined {
    return this.state.externalLinks.find(
      l =>
        l.organizationId === orgId &&
        l.provider === provider &&
        l.connectionId === connectionId &&
        l.externalEntityType === externalEntityType &&
        l.externalEntityId === externalEntityId
    );
  }

  public upsertExternalLink(
    input: Omit<IntegrationExternalLinkRecord, 'id' | 'lastSyncedAt'>
  ): IntegrationExternalLinkRecord {
    const now = new Date().toISOString();
    const existing = this.findExternalLink(
      input.organizationId,
      input.provider,
      input.connectionId,
      input.externalEntityType,
      input.externalEntityId
    );
    const record: IntegrationExternalLinkRecord = {
      id: existing?.id || `link-${crypto.randomUUID().slice(0, 10)}`,
      ...input,
      missingInSource: input.missingInSource ?? false,
      lastSyncedAt: now,
    };

    this.state.externalLinks = [
      record,
      ...this.state.externalLinks.filter(l => l.id !== record.id),
    ].slice(0, 5000);
    this.persist();
    return record;
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
    for (const link of this.state.externalLinks) {
      if (
        link.organizationId === orgId &&
        link.provider === provider &&
        link.connectionId === connectionId &&
        link.externalEntityType === externalEntityType &&
        (!projectFilter || link.localProjectId === projectFilter)
      ) {
        if (!seenExternalIds.has(link.externalEntityId) && !link.missingInSource) {
          link.missingInSource = true;
          flagged.push(link);
        }
      }
    }
    if (flagged.length > 0) this.persist();
    return flagged;
  }

  // ---- Conflicts ----
  public listConflicts(orgId: string, status?: string): IntegrationConflictRecord[] {
    return this.state.conflicts
      .filter(c => c.organizationId === orgId && (!status || c.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public createConflict(
    input: Omit<IntegrationConflictRecord, 'id' | 'status' | 'createdAt'>
  ): IntegrationConflictRecord {
    const conflict: IntegrationConflictRecord = {
      id: `conf-${crypto.randomUUID().slice(0, 9)}`,
      ...input,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.state.conflicts = [conflict, ...this.state.conflicts].slice(0, 500);
    this.persist();
    return conflict;
  }

  public resolveConflict(
    orgId: string,
    conflictId: string,
    resolution: 'resolved_source' | 'resolved_destination' | 'resolved_merged' | 'dismissed',
    resolvedBy: string,
    mergedFields?: Record<string, 'source' | 'destination'>
  ): IntegrationConflictRecord | undefined {
    const conflict = this.state.conflicts.find(
      c => c.organizationId === orgId && c.id === conflictId
    );
    if (!conflict) return undefined;
    conflict.status = resolution;
    conflict.resolvedBy = resolvedBy;
    conflict.resolvedAt = new Date().toISOString();
    if (mergedFields) {
      conflict.fieldDiffs = conflict.fieldDiffs.map(d => ({
        ...d,
        chosen: mergedFields[d.field] || (resolution === 'resolved_source' ? 'source' : 'destination'),
      }));
    }
    this.persist();
    return conflict;
  }

  // ---- Audit Logs ----
  public listAuditLogs(orgId: string, provider?: string): IntegrationAuditLogRecord[] {
    return this.state.auditLogs
      .filter(a => a.organizationId === orgId && (!provider || provider === 'all' || a.provider === provider))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200);
  }

  public appendAuditLog(input: Omit<IntegrationAuditLogRecord, 'id' | 'createdAt'>): IntegrationAuditLogRecord {
    const entry: IntegrationAuditLogRecord = {
      id: `audit-${crypto.randomUUID().slice(0, 10)}`,
      ...input,
      metadata: scrubSensitiveMetadata(input.metadata),
      createdAt: new Date().toISOString(),
    };
    this.state.auditLogs = [entry, ...this.state.auditLogs].slice(0, 1000);
    this.persist();
    return entry;
  }

  // ---- History ----
  public listHistory(orgId: string): SyncHistoryRecord[] {
    return this.state.history
      .filter(h => h.organizationId === orgId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 80);
  }

  public appendHistory(input: Omit<SyncHistoryRecord, 'id' | 'timestamp'>): SyncHistoryRecord {
    const rec: SyncHistoryRecord = {
      id: `sync-${crypto.randomUUID().slice(0, 8)}`,
      ...input,
      timestamp: new Date().toISOString(),
    };
    this.state.history = [rec, ...this.state.history].slice(0, 300);
    this.persist();
    return rec;
  }
}

export const integrationStore = new IntegrationStore();
