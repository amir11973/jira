import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Persistent SQLite database for JiraFlow (single file, WAL mode).
 * Location can be overridden with JIRAFLOW_DB_PATH (use ":memory:" in tests).
 */
const DEFAULT_DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_PATH = process.env.JIRAFLOW_DB_PATH || path.join(DEFAULT_DATA_DIR, 'jiraflow.db');

if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA synchronous = NORMAL;');

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        must_change_password INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER,
        profile TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        org_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);

      CREATE TABLE records (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        project_id TEXT,
        owner_id TEXT,
        data TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX idx_records_scope ON records(collection, org_id, deleted);
      CREATE INDEX idx_records_project ON records(collection, project_id);

      CREATE TABLE changes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        op TEXT NOT NULL,
        ts TEXT NOT NULL
      );
      CREATE INDEX idx_changes_org ON changes(org_id, seq);

      CREATE TABLE issue_comments (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_comments_issue ON issue_comments(issue_id);

      CREATE TABLE issue_worklogs (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        time_spent_minutes INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_worklogs_issue ON issue_worklogs(issue_id);

      CREATE TABLE issue_attachments (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        name TEXT NOT NULL,
        size TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        uploaded_by TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        storage_key TEXT,
        size_bytes INTEGER
      );
      CREATE INDEX idx_attachments_issue ON issue_attachments(issue_id);

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        org_id TEXT NOT NULL,
        actor_id TEXT,
        actor_email TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        collection TEXT,
        entity_id TEXT,
        status TEXT NOT NULL,
        summary TEXT NOT NULL,
        changes TEXT,
        ip TEXT,
        request_id TEXT
      );
      CREATE INDEX idx_audit_org_ts ON audit_log(org_id, id);
      CREATE INDEX idx_audit_entity ON audit_log(collection, entity_id);

      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        run_at INTEGER NOT NULL,
        locked_until INTEGER,
        last_error TEXT,
        dedupe_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX idx_jobs_due ON jobs(status, run_at);
      CREATE UNIQUE INDEX idx_jobs_dedupe ON jobs(dedupe_key) WHERE dedupe_key IS NOT NULL;
    `,
  },
  {
    version: 3,
    // Append-only history used by the reports (burndown, velocity). Written by the server on every issue / sprint
    // write so the numbers cannot be rewritten by a client. "estimated" rows were reconstructed for data that
    // existed before history was tracked.
    sql: `
      CREATE TABLE issue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        actor_id TEXT,
        kind TEXT NOT NULL,
        from_value TEXT,
        to_value TEXT,
        estimated INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_issue_events_issue ON issue_events(issue_id, ts, id);
      CREATE INDEX idx_issue_events_project ON issue_events(project_id, kind);

      CREATE TABLE sprint_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        org_id TEXT NOT NULL,
        sprint_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        actor_id TEXT,
        kind TEXT NOT NULL,
        estimated INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_sprint_events_sprint ON sprint_events(sprint_id, ts, id);
    `,
  },
];

function migrate(): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(r => r.version)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        m.version,
        new Date().toISOString()
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

migrate();

let txDepth = 0;

/** Run fn inside a transaction (nested calls join the outer transaction). */
export function transaction<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  txDepth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

export function getMeta(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

export function setMeta(key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export const DEFAULT_ORG_ID = 'org-default';
