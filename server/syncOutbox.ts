/**
 * Called inside the write transaction of user changes (transactional outbox): when a linked, two-way synced
 * work item or Confluence-backed page changes locally, queue a push. Kept free of repo.ts imports.
 */
import { enqueueJob } from './jobs.ts';
import { integrationStore } from './store.ts';
import { stableStringify } from './cryptoVault.ts';

type Rec = Record<string, unknown>;

const ISSUE_FIELDS = ['summary', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'labels'];

const differs = (a: unknown, b: unknown) => stableStringify(a ?? null) !== stableStringify(b ?? null);

function queuePush(orgId: string, localType: 'issue' | 'doc', localId: string, version: number): void {
  const link = integrationStore.findExternalLinkByLocal(orgId, localType, localId);
  if (!link || !link.bidirectional || link.missingInSource) return;
  // short delay so a burst of edits is pushed once; the record version makes every change unique
  enqueueJob(orgId, 'integration.push', { linkId: link.id }, {
    maxAttempts: 4,
    runAt: Date.now() + Number(process.env.INTEGRATION_PUSH_DELAY_MS || 2000),
    dedupeKey: `push-${link.id}-${version}`,
  });
}

export function emitSyncOutbox(orgId: string, collection: string, before: Rec | null, after: Rec, version: number): void {
  if (!before) return;
  if (collection === 'issues') {
    if (ISSUE_FIELDS.some(f => differs(before[f], after[f]))) queuePush(orgId, 'issue', String(after.id), version);
  } else if (collection === 'projects') {
    const prior = new Map(((before.docs as Rec[] | undefined) || []).map(d => [String(d.id), d]));
    for (const doc of (after.docs as Rec[] | undefined) || []) {
      const old = prior.get(String(doc.id));
      if (old && (differs(old.title, doc.title) || differs(old.content, doc.content))) {
        queuePush(orgId, 'doc', String(doc.id), version);
      }
    }
  }
}
