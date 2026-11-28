import express from 'express';
import type { Response } from 'express';
import { db } from './db.ts';
import { requireAuth } from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { badRequest, notFound } from './errors.ts';
import { breakdownReport, burndownReport, velocityReport } from './reports.ts';
import { computeGoals, computeMilestones, computeReleases, computeRoadmap, loadPlanningData } from './planning.ts';

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function projectOf(req: AuthenticatedRequest): string {
  const projectId = str(req.query.projectId);
  if (!projectId) throw badRequest('"projectId" is required.');
  const exists = db
    .prepare("SELECT 1 FROM records WHERE collection = 'projects' AND id = ? AND org_id = ? AND deleted = 0")
    .get(projectId, req.authUser!.organizationId);
  if (!exists) throw notFound(`Space "${projectId}" not found.`);
  return projectId;
}

/** Read-only report and planning endpoints. Every figure is computed from live data on each request. */
export function createReportsRouter(): express.Router {
  const router = express.Router();

  router.get('/reports/burndown', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const sprintId = str(req.query.sprintId);
    if (!sprintId) throw badRequest('"sprintId" is required.');
    const report = burndownReport(req.authUser!.organizationId, sprintId, str(req.query.metric) || 'auto');
    if (!report) throw notFound(`Sprint "${sprintId}" not found.`);
    res.json(report);
  });

  router.get('/reports/velocity', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = projectOf(req);
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 8));
    res.json(velocityReport(req.authUser!.organizationId, projectId, limit));
  });

  router.get('/reports/breakdown', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = projectOf(req);
    res.json(
      breakdownReport(req.authUser!.organizationId, projectId, {
        sprintId: str(req.query.sprintId),
        versionId: str(req.query.versionId),
        epicId: str(req.query.epicId),
        assigneeId: str(req.query.assigneeId),
        includeArchived: req.query.includeArchived === 'true',
      })
    );
  });

  router.get('/planning/goals', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = projectOf(req);
    const data = loadPlanningData(req.authUser!.organizationId, projectId);
    res.json({ today: data.today, goals: computeGoals(data), milestones: computeMilestones(data) });
  });

  router.get('/planning/releases', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = projectOf(req);
    const data = loadPlanningData(req.authUser!.organizationId, projectId);
    res.json({ today: data.today, releases: computeReleases(data) });
  });

  router.get('/planning/roadmap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const projectId = projectOf(req);
    res.json(computeRoadmap(loadPlanningData(req.authUser!.organizationId, projectId)));
  });

  return router;
}
