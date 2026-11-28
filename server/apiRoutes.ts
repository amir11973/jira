import crypto from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_ORG_ID, getMeta } from './db.ts';
import { queryAudit, writeAudit } from './audit.ts';
import {
  asyncHandler,
  checkIpRateLimit,
  clearFailedLogins,
  clearSessionCookie,
  clientIp,
  createSession,
  generateTemporaryPassword,
  getDummyHash,
  hashPassword,
  passwordPolicyError,
  registerFailedLogin,
  requireAuth,
  requireRole,
  resetIpRateLimit,
  revokeSessionByToken,
  revokeUserSessions,
  setSessionCookie,
  verifyPassword,
} from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { HttpError, badRequest, forbidden, notFound, tooMany, validationFailed } from './errors.ts';
import type { Actor } from './permissions.ts';
import {
  applyBatch,
  bootstrapData,
  changesSince,
  getPublicUser,
  getRecord,
  getUserByEmail,
  getUserRow,
  listCollection,
  mustChangePassword,
} from './repo.ts';
import type { BatchOp } from './repo.ts';
import { ALL_COLLECTIONS, isCollection } from './schemas.ts';
import { cancelJob, jobStats, listJobs, retryJob } from './jobs.ts';
import { createFilesRouter } from './files.ts';
import { createReportsRouter } from './reportRoutes.ts';
import { currentEpoch, isDemoMode, resetToDemoWorkspace } from './seed.ts';
import { db } from './db.ts';

function actorOf(req: AuthenticatedRequest): Actor {
  const u = req.authUser!;
  return { userId: u.userId, orgId: u.organizationId, email: u.email, role: u.role };
}

function metaOf(req: AuthenticatedRequest) {
  return { ip: clientIp(req), requestId: req.requestId };
}

/** Request id + lightweight security headers + coarse per-IP API rate limiting. */
export function baseMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID().slice(0, 12);
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}

const apiHits = new Map<string, { count: number; resetAt: number }>();
export function apiRateLimit(max = 1200, windowMs = 60_000) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = clientIp(req);
    const now = Date.now();
    const entry = apiHits.get(key);
    if (!entry || entry.resetAt < now) {
      apiHits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      next(tooMany());
      return;
    }
    next();
  };
}

export function createDataRouter(): express.Router {
  const router = express.Router();
  router.use(createFilesRouter());
  router.use(createReportsRouter());

  // ------------------------------------------------------------------ auth
  router.get('/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  router.get('/auth/config', (_req, res) => {
    const demo = isDemoMode();
    const demoAccounts = demo
      ? (
          db
            .prepare("SELECT id, email, role, profile FROM users WHERE status = 'active' ORDER BY created_at, id")
            .all() as unknown as Array<{ id: string; email: string; role: string; profile: string }>
        ).map(r => {
          const p = JSON.parse(r.profile) as Record<string, unknown>;
          return {
            id: r.id,
            email: r.email,
            role: r.role,
            name: p.name,
            nameFa: p.nameFa,
            avatar: p.avatar,
            avatarColor: p.avatarColor,
            department: p.department,
          };
        })
      : [];
    res.json({ demoMode: demo, demoAccounts });
  });

  router.post(
    '/auth/login',
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const ip = clientIp(req);
      checkIpRateLimit(ip);
      const { email, password } = (req.body || {}) as { email?: unknown; password?: unknown };
      if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
        throw badRequest('Email and password are required.');
      }
      if (email.length > 254 || password.length > 200) throw badRequest('Invalid credentials format.');

      const user = getUserByEmail(email.trim());
      const lockedUntil = user?.locked_until;
      const genericFailure = new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

      if (user && lockedUntil && lockedUntil > Date.now()) {
        writeAudit({
          orgId: user.org_id,
          actorId: user.id,
          actorEmail: user.email,
          actorRole: user.role,
          action: 'auth.login',
          status: 'denied',
          summary: 'Login attempt on a locked account.',
          ip,
          requestId: req.requestId,
        });
        throw new HttpError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. The account is temporarily locked.');
      }

      const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()));
      if (!user || !ok || user.status !== 'active') {
        let locked = false;
        if (user && user.status === 'active') locked = registerFailedLogin(user.id).locked;
        writeAudit({
          orgId: user?.org_id || DEFAULT_ORG_ID,
          actorId: user?.id,
          actorEmail: email.trim().slice(0, 254),
          actorRole: user?.role,
          action: 'auth.login',
          status: 'failed',
          summary: user && user.status !== 'active' ? 'Login attempt on a deactivated account.' : locked ? 'Account locked after repeated failures.' : 'Invalid credentials.',
          ip,
          requestId: req.requestId,
        });
        throw genericFailure;
      }

      clearFailedLogins(user.id);
      resetIpRateLimit(ip);
      const session = createSession(user.id, user.org_id, ip, req.headers['user-agent']);
      setSessionCookie(req, res, session.token, session.expiresAt);
      writeAudit({
        orgId: user.org_id,
        actorId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: 'auth.login',
        summary: 'Signed in.',
        ip,
        requestId: req.requestId,
      });
      res.json({
        user: getPublicUser(user.id),
        mustChangePassword: Boolean(user.must_change_password),
        expiresAt: session.expiresAt,
      });
    })
  );

  router.post('/auth/logout', (req: AuthenticatedRequest, res: Response) => {
    const header = req.headers.cookie || '';
    const match = /(?:^|;\s*)jf_session=([^;]+)/.exec(header);
    if (match) {
      const token = decodeURIComponent(match[1]);
      revokeSessionByToken(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = getPublicUser(req.authUser!.userId);
    if (!user) throw notFound('User no longer exists.');
    res.json({ user, mustChangePassword: mustChangePassword(req.authUser!.userId), epoch: currentEpoch() });
  });

  router.post(
    '/auth/change-password',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const { currentPassword, newPassword } = (req.body || {}) as { currentPassword?: unknown; newPassword?: unknown };
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        throw badRequest('currentPassword and newPassword are required.');
      }
      const policy = passwordPolicyError(newPassword);
      if (policy) throw validationFailed([{ path: 'newPassword', message: policy }]);
      if (newPassword === currentPassword) {
        throw validationFailed([{ path: 'newPassword', message: 'The new password must differ from the current one.' }]);
      }
      const row = getUserRow(req.authUser!.userId);
      if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
        writeAudit({
          orgId: req.authUser!.organizationId,
          actorId: req.authUser!.userId,
          actorEmail: req.authUser!.email,
          actorRole: req.authUser!.role,
          action: 'auth.change_password',
          status: 'failed',
          summary: 'Wrong current password.',
          ip: clientIp(req),
          requestId: req.requestId,
        });
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'The current password is incorrect.');
      }
      const hash = await hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(
        hash,
        new Date().toISOString(),
        row.id
      );
      revokeUserSessions(row.id, req.authUser!.sessionId);
      writeAudit({
        orgId: row.org_id,
        actorId: row.id,
        actorEmail: row.email,
        actorRole: row.role,
        action: 'auth.change_password',
        summary: 'Password changed; other sessions were revoked.',
        ip: clientIp(req),
        requestId: req.requestId,
      });
      res.json({ ok: true });
    })
  );

  // ------------------------------------------------------------------ data
  router.get('/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    const user = getPublicUser(req.authUser!.userId);
    if (!user) throw notFound('User no longer exists.');
    res.json({
      user,
      mustChangePassword: mustChangePassword(req.authUser!.userId),
      epoch: currentEpoch(),
      serverTime: new Date().toISOString(),
      ...bootstrapData(orgId, actorOf(req)),
    });
  });

  router.get('/changes', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const since = Number(req.query.since);
    if (!Number.isInteger(since) || since < 0) throw badRequest('"since" must be a non-negative integer.');
    res.json({ epoch: currentEpoch(), ...changesSince(req.authUser!.organizationId, since, actorOf(req)) });
  });

  router.post(
    '/data/batch',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const ops = (req.body as { ops?: BatchOp[] } | undefined)?.ops;
      const result = await applyBatch(actorOf(req), ops as BatchOp[], metaOf(req));
      res.json(result);
    })
  );

  const collectionParam = (req: Request) => {
    const name = req.params.collection;
    if (!isCollection(name)) throw notFound(`Unknown collection "${name}". Valid: ${ALL_COLLECTIONS.join(', ')}.`);
    return name;
  };

  router.get('/data/:collection', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const name = collectionParam(req);
    const items = listCollection(req.authUser!.organizationId, name, actorOf(req));
    res.json({ items: items.map(i => i.record), versions: Object.fromEntries(items.map(i => [i.record.id, i.version])) });
  });

  router.get('/data/:collection/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const name = collectionParam(req);
    const found = getRecord(req.authUser!.organizationId, name, req.params.id, actorOf(req));
    if (!found) throw notFound(`${name}/${req.params.id} not found.`);
    res.json({ item: found.record, version: found.version });
  });

  router.put(
    '/data/:collection/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const name = collectionParam(req);
      const body = (req.body || {}) as { data?: unknown; baseVersion?: number };
      const result = await applyBatch(
        actorOf(req),
        [{ collection: name, op: 'upsert', id: req.params.id, data: body.data ?? req.body, baseVersion: body.baseVersion }],
        metaOf(req)
      );
      res.json(result);
    })
  );

  router.delete(
    '/data/:collection/:id',
    requireAuth,
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const name = collectionParam(req);
      const result = await applyBatch(actorOf(req), [{ collection: name, op: 'delete', id: req.params.id }], metaOf(req));
      res.json(result);
    })
  );

  // ------------------------------------------------------------------ admin
  router.get('/audit', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
    const q = req.query;
    const rows = queryAudit(req.authUser!.organizationId, {
      collection: typeof q.collection === 'string' ? q.collection : undefined,
      entityId: typeof q.entityId === 'string' ? q.entityId : undefined,
      actorId: typeof q.actorId === 'string' ? q.actorId : undefined,
      action: typeof q.action === 'string' ? q.action : undefined,
      before: q.before ? Number(q.before) : undefined,
      limit: q.limit ? Number(q.limit) : 100,
    });
    res.json({ entries: rows, nextBefore: rows.length ? rows[rows.length - 1].id : null });
  });

  router.post(
    '/users/:id/reset-password',
    requireAuth,
    requireRole('admin'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      const target = getUserRow(req.params.id);
      if (!target || target.org_id !== req.authUser!.organizationId) throw notFound('User not found.');
      const temp = generateTemporaryPassword();
      const hash = await hashPassword(temp);
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(
        hash,
        new Date().toISOString(),
        target.id
      );
      revokeUserSessions(target.id);
      writeAudit({
        orgId: target.org_id,
        actorId: req.authUser!.userId,
        actorEmail: req.authUser!.email,
        actorRole: req.authUser!.role,
        action: 'users.reset_password',
        collection: 'users',
        entityId: target.id,
        summary: `Reset password for ${target.email}.`,
        ip: clientIp(req),
        requestId: req.requestId,
      });
      res.json({ userId: target.id, email: target.email, temporaryPassword: temp });
    })
  );

  // ------------------------------------------------------------------ background jobs
  router.get('/admin/jobs', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
    const orgId = req.authUser!.organizationId;
    res.json({
      stats: jobStats(orgId),
      jobs: listJobs(orgId, {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      }),
    });
  });

  router.post('/admin/jobs/:id/retry', requireAuth, requireRole('admin'), (req: AuthenticatedRequest, res: Response) => {
    const job = retryJob(req.authUser!.organizationId, Number(req.params.id));
    if (!job) throw notFound('Only failed or cancelled jobs can be retried.');
    res.json({ job });
  });

  /** Retry a failed automation run from its execution log (admin, product owner or the space lead). */
  router.post('/automation/logs/:logId/retry', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const actor = actorOf(req);
    const log = getRecord(actor.orgId, 'automationLogs', req.params.logId, actor);
    if (!log) throw notFound('Automation log not found.');
    const projectId = String(log.record.projectId || '');
    const project = getRecord(actor.orgId, 'projects', projectId, actor);
    const allowed = actor.role === 'admin' || actor.role === 'product_owner' || project?.record.leadId === actor.userId;
    if (!allowed) throw forbidden('Only administrators, product owners or the space lead can retry automation runs.');
    const jobId = Number(log.record.jobId);
    const job = Number.isInteger(jobId) ? retryJob(actor.orgId, jobId) : undefined;
    if (!job) throw badRequest('This run is not in a failed state and cannot be retried.');
    writeAudit({
      orgId: actor.orgId,
      actorId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: 'automation.retry',
      collection: 'automationLogs',
      entityId: req.params.logId,
      summary: `Retried automation run (job #${job.id}).`,
      ip: clientIp(req),
      requestId: req.requestId,
    });
    res.json({ job });
  });

  router.post(
    '/admin/reset-demo',
    requireAuth,
    requireRole('admin'),
    asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_RESET !== 'true') {
        throw forbidden('Resetting to demo data is disabled in production.');
      }
      if ((req.body as { confirm?: unknown } | undefined)?.confirm !== 'RESET') {
        throw badRequest('Send {"confirm":"RESET"} to confirm this destructive operation.');
      }
      await resetToDemoWorkspace(actorOf(req), clientIp(req));
      clearSessionCookie(req, res);
      res.json({ ok: true, message: 'Workspace reset. Please sign in again.' });
    })
  );

  void getMeta;
  return router;
}

/** Terminal JSON error handler for /api routes. */
export function apiErrorHandler(err: unknown, req: AuthenticatedRequest, res: Response, _next: NextFunction): void {
  void _next;
  if (res.headersSent) return;
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
      requestId: req.requestId,
    });
    return;
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE', requestId: req.requestId });
    return;
  }
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON.', code: 'BAD_REQUEST', requestId: req.requestId });
    return;
  }
  console.error(`[api] unhandled error (request ${req.requestId}):`, err);
  res.status(500).json({
    error: 'An unexpected server error occurred.',
    code: 'INTERNAL_ERROR',
    requestId: req.requestId,
  });
}
