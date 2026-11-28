<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/40aae8ad-97ae-418d-a31e-40e1533460f6

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`



## Backend, authentication & data (P0)

JiraFlow has a real backend (Express + SQLite via the built-in `node:sqlite`, Node 22.13+ / 24):

| Concern | Implementation |
| --- | --- |
| Persistence | `server/db.ts`: versioned migrations, WAL mode, single file at `.data/jiraflow.db` |
| Authentication | `server/auth.ts`: scrypt password hashes, opaque server-side sessions in an HttpOnly SameSite cookie, sliding 12h expiry, login lockout (5 failures / 15 min), per-IP rate limits, forced password change for temporary passwords |
| Authorization | `server/permissions.ts`: role + ownership + project-lead matrix, enforced on every write |
| Data API | `server/repo.ts`, `server/apiRoutes.ts`: `GET /api/bootstrap`, `POST /api/data/batch` (atomic), `GET/PUT/DELETE /api/data/:collection/:id`, `GET /api/changes?since=` |
| Validation | `server/validation.ts`, `server/schemas.ts`: typed schemas, referential checks, workflow-transition checks, optimistic concurrency (`baseVersion`) |
| Normalised tables | issue comments, worklogs and attachment metadata have their own tables; authors cannot be forged |
| Audit log | `audit_log` table: sign-ins, denials, every create/update/delete with field diffs (UI: Admin > System > Audit Log, API: `GET /api/audit`) |
| Client sync | `src/services/syncEngine.ts`: diff-based batching, retry with backoff, conflict handling, 8s change polling for multi-user edits |

Demo mode (development only): all seeded users have the password `password123` and the login page shows quick-login cards.
In production set `SEED_DEFAULT_PASSWORD`, or use the one-time admin password printed to the server log on first start. See `.env.example`.

## Core workflow features (P1)

| Feature | How it works |
| --- | --- |
| Attachments | `POST /api/issues/:id/attachments?filename=&type=` (raw body, 25 MB default, executables blocked) stores the file under `.data/uploads`; `GET /api/attachments/:id` streams it back as a forced download with `nosniff`. Metadata-only attachments are rejected. Files are removed with the attachment or the issue. |
| Dev links | Repositories are connected under Development > Repositories (`repositories` collection, admin/product owner). A development link must reference a connected, enabled repository (optionally restricted to spaces), live on that repository's host/path and match its type (PR / branch / commit). Only the source-control integration or an admin can mark links merged/deployed. |
| Saved filters | `shareScope` private / team / organization is enforced on **read**: hidden filters are absent from bootstrap, lists, direct GETs and the change feed (a scope change is delivered to others as a deletion). Only the owner/admin can edit or delete. |
| Dashboards | `viewScope`, `editScope`, `sharedWithUserIds`, `editorUserIds`. Viewers see it, designated editors can change content but not sharing/ownership; owner/admin control sharing and deletion. |
| Notifications | Per-user records created by the server (assignment, comments, transitions, creation, automation) according to the space's notification settings; only the recipient can read them or mark them read. Optional email through `SMTP_URL` with retries. |
| Automation | Rules run on the server through a durable job queue (`jobs` table): one job per matching rule and event, retried with exponential backoff (4 attempts, permanent errors fail fast), idempotent logs (`automationLogs`, status success/skipped/retrying/failed), rule counters, issue execution history, failed runs can be retried from the UI. Actions: auto-assign, resolution/unflag, add lead as watcher, close parent epic, notify assignee, send webhook (SSRF-guarded). Admins can inspect jobs at `GET /api/admin/jobs`. |

## Reporting & planning (P2)

Reports and planning figures are **computed on the server from live data** on every request; nothing is stored in
the browser. The views refresh themselves when work items change (after your edits have been saved).

| Feature | How it works |
| --- | --- |
| History | Every issue / sprint write also appends to `issue_events` / `sprint_events` (created, status, sprint, story points, archived, deleted; sprint started/completed) inside the same transaction, so clients cannot rewrite it. Data that pre-dates this (the demo workspace, databases created before P2) is reconstructed once at startup from creation/update dates and flagged **estimated** in the UI. |
| Burndown | `GET /api/reports/burndown?sprintId=&metric=points\|count` replays the history day by day: commitment at sprint start, scope added / removed, completed and remaining work, ideal line, burn rate, forecast and projected finish. Completed sprints are frozen at completion. |
| Velocity | `GET /api/reports/velocity?projectId=&limit=` lists completed sprints: committed (at start), added, completed, unfinished work and completion rate, plus the rolling average. Work taken out of a sprint before it ended counts as descoped, not missed; deleted items are ignored. |
| Breakdown | `GET /api/reports/breakdown?projectId=` counts and story points by type, priority, status, assignee, epic, sprint, version, component, label and resolution, with sprint / version / epic filters and totals (overdue, unassigned, unestimated). |
| Goals & milestones | `GET /api/planning/goals?projectId=` adds progress (from linked epics / issues / milestones, or a manual percentage), health (completed / overdue / blocked / at risk / on track), days left and blockers. Writes are validated: dates in order, linked records must exist in the space, **no circular or self dependencies**, and a goal / milestone cannot be completed while something it depends on is unfinished. `completedAt` is stamped by the server. |
| Releases | `GET /api/planning/releases?projectId=` derives each version from the issues that have it as fix version: progress by status category, open work, derived start / release date, overdue / at-risk detection and "ready to release". Fix versions must exist in the issue's space; version names are unique per space; releasing without a date stamps today. |
| Roadmap | `GET /api/planning/roadmap?projectId=` returns epics with their own dates or dates derived from child issues / sprints, progress, slipping / overdue flags, plus sprints, releases and milestones for the same timeline. |

Existing databases migrate automatically (migration v3 adds the history tables; history is reconstructed on first start).
