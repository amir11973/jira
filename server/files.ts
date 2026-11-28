import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Response } from 'express';
import { db, transaction } from './db.ts';
import { writeAudit } from './audit.ts';
import { asyncHandler, clientIp, requireAuth } from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { HttpError, badRequest, forbidden, notFound } from './errors.ts';
import { canRead, VisibilityContext } from './visibility.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
export const UPLOAD_DIR =
  process.env.JIRAFLOW_UPLOAD_DIR ||
  (process.env.JIRAFLOW_DB_PATH && process.env.JIRAFLOW_DB_PATH !== ':memory:'
    ? path.join(path.dirname(process.env.JIRAFLOW_DB_PATH), 'uploads')
    : path.join(DATA_DIR, 'uploads'));

export const MAX_UPLOAD_BYTES = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 25)) * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'scr', 'msi', 'dll', 'vbs', 'ps1', 'jar', 'sh', 'cpl', 'hta', 'lnk', 'reg',
]);
// Types a browser could execute if served inline. We always send "attachment" + nosniff, but we also
// downgrade the content type as a second layer.
const ACTIVE_CONTENT = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

export function sanitizeFileName(raw: string): string {
  let name = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '');
  name = name.split(/[\\/]/).pop() || '';
  name = name.replace(/^\.+/, '').trim();
  if (name.length > 180) {
    const ext = path.extname(name).slice(0, 12);
    name = name.slice(0, 180 - ext.length) + ext;
  }
  return name;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function storagePath(key: string): string {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid storage key');
  return path.join(UPLOAD_DIR, key);
}

export function deleteStoredFiles(keys: Array<string | null | undefined>): void {
  for (const key of keys) {
    if (!key) continue;
    try {
      fs.rmSync(storagePath(key), { force: true });
    } catch (err) {
      console.error('[files] could not remove stored file', key, err);
    }
  }
}

interface AttachmentRow {
  id: string;
  org_id: string;
  issue_id: string;
  name: string;
  size: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
  storage_key: string | null;
  size_bytes: number | null;
}

export function createFilesRouter(): express.Router {
  const router = express.Router();

  // Raw body upload: the client sends the file bytes with Content-Type: application/octet-stream and
  // passes the real name / type in the query string (so the JSON body parser never touches the file).
  router.post(
    '/issues/:issueId/attachments',
    requireAuth,
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.authUser!;
      const issueId = req.params.issueId;
      const issue = db
        .prepare("SELECT data, version FROM records WHERE collection = 'issues' AND id = ? AND org_id = ? AND deleted = 0")
        .get(issueId, actor.organizationId) as { data: string; version: number } | undefined;
      if (!issue) throw notFound('Work item not found.');

      const name = sanitizeFileName(String(req.query.filename || ''));
      if (!name) throw badRequest('A "filename" query parameter is required.');
      const ext = path.extname(name).slice(1).toLowerCase();
      if (BLOCKED_EXTENSIONS.has(ext)) {
        throw new HttpError(415, 'UNSUPPORTED_FILE_TYPE', `Files of type ".${ext}" cannot be attached.`);
      }
      const body = req.body as Buffer | undefined;
      if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('The uploaded file is empty.');
      if (body.length > MAX_UPLOAD_BYTES) {
        throw new HttpError(413, 'PAYLOAD_TOO_LARGE', `Files may be at most ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      }

      let mime = String(req.query.type || 'application/octet-stream').slice(0, 120);
      if (!/^[\w.+-]+\/[\w.+-]+$/.test(mime)) mime = 'application/octet-stream';

      const key = crypto.randomUUID();
      fs.writeFileSync(storagePath(key), body, { flag: 'wx' });
      const id = `att-${crypto.randomUUID().slice(0, 12)}`;
      const now = new Date().toISOString();
      const issueData = JSON.parse(issue.data) as { key?: string };

      let newVersion = issue.version + 1;
      try {
        transaction(() => {
          db.prepare(
            `INSERT INTO issue_attachments (id, org_id, issue_id, name, size, mime_type, uploaded_by, uploaded_at, storage_key, size_bytes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(id, actor.organizationId, issueId, name, formatSize(body.length), mime, actor.userId, now, key, body.length);
          db.prepare("UPDATE records SET version = version + 1, updated_at = ? WHERE collection = 'issues' AND id = ? AND org_id = ?").run(
            now,
            issueId,
            actor.organizationId
          );
          db.prepare('INSERT INTO changes (collection, id, org_id, op, ts) VALUES (?, ?, ?, ?, ?)').run(
            'issues',
            issueId,
            actor.organizationId,
            'update',
            now
          );
          writeAudit({
            orgId: actor.organizationId,
            actorId: actor.userId,
            actorEmail: actor.email,
            actorRole: actor.role,
            action: 'issues.attachment.add',
            collection: 'issues',
            entityId: issueId,
            summary: `Attached ${name} (${formatSize(body.length)}) to ${issueData.key || issueId}`,
            changes: { attachmentId: id, mimeType: mime, bytes: body.length },
            ip: clientIp(req),
            requestId: req.requestId,
          });
        });
      } catch (err) {
        deleteStoredFiles([key]);
        throw err;
      }
      newVersion = (
        db.prepare("SELECT version FROM records WHERE collection = 'issues' AND id = ?").get(issueId) as { version: number }
      ).version;

      res.status(201).json({
        attachment: {
          id,
          name,
          size: formatSize(body.length),
          sizeBytes: body.length,
          mimeType: mime,
          uploadedBy: actor.userId,
          uploadedAt: now,
          downloadUrl: `/api/attachments/${id}`,
        },
        issueVersion: newVersion,
      });
    })
  );

  router.get(
    '/attachments/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const actor = req.authUser!;
      const row = db.prepare('SELECT * FROM issue_attachments WHERE id = ? AND org_id = ?').get(req.params.id, actor.organizationId) as
        | AttachmentRow
        | undefined;
      if (!row) throw notFound('Attachment not found.');
      const issue = db
        .prepare("SELECT data FROM records WHERE collection = 'issues' AND id = ? AND org_id = ? AND deleted = 0")
        .get(row.issue_id, actor.organizationId) as { data: string } | undefined;
      if (!issue) throw notFound('Attachment not found.');
      if (!canRead({ userId: actor.userId, orgId: actor.organizationId, email: actor.email, role: actor.role }, 'issues', JSON.parse(issue.data), new VisibilityContext(actor.organizationId))) {
        throw forbidden('You cannot access this attachment.');
      }
      if (!row.storage_key) {
        throw new HttpError(404, 'FILE_UNAVAILABLE', 'This attachment has no stored file (it was created before file storage existed).');
      }
      const file = storagePath(row.storage_key);
      if (!fs.existsSync(file)) throw new HttpError(404, 'FILE_UNAVAILABLE', 'The stored file is missing on the server.');

      const safeName = row.name.replace(/["\r\n]/g, '_');
      const contentType = ACTIVE_CONTENT.test(row.mime_type) ? 'application/octet-stream' : row.mime_type;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(fs.statSync(file).size));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(row.name)}`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
      writeAudit({
        orgId: actor.organizationId,
        actorId: actor.userId,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'issues.attachment.download',
        collection: 'issues',
        entityId: row.issue_id,
        summary: `Downloaded ${row.name}`,
        ip: clientIp(req),
        requestId: req.requestId,
      });
      fs.createReadStream(file).pipe(res);
    })
  );

  return router;
}
