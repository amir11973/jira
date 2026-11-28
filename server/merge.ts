/**
 * Pure three-way merge used by bidirectional sync. "base" holds the values both systems agreed on at the last
 * sync; comparing each side with it tells who changed what, so independent edits merge automatically and only
 * real collisions become conflicts.
 */
import { computeSyncHash, stableStringify } from './cryptoVault.ts';

export type ConflictPolicy = 'source_wins' | 'destination_wins' | 'manual_review';
export type Fields = Record<string, unknown>;

export interface FieldConflict {
  field: string;
  baseValue: unknown;
  sourceValue: unknown;
  localValue: unknown;
}

export interface MergeResult {
  /** Values to write locally (came from the source). */
  localPatch: Fields;
  /** Values to write to the source (came from local edits). */
  remotePatch: Fields;
  conflicts: FieldConflict[];
  /** New common ancestor. Fields with unresolved / unpushed differences keep their previous ancestor. */
  base: Fields;
  /** Local edits that stay local because the link is one-way or the field cannot be written to the source. */
  keptLocal: string[];
}

export const same = (a: unknown, b: unknown): boolean => stableStringify(a ?? null) === stableStringify(b ?? null);

/** Fingerprint of a (local, source) value pair; used to remember differences a person chose to ignore. */
export const pairHash = (local: unknown, source: unknown): string => computeSyncHash([local ?? null, source ?? null]);

export function threeWayMerge(input: {
  base: Fields | undefined;
  local: Fields;
  /** A field that is `undefined` here cannot be represented locally (e.g. unknown assignee) and is ignored. */
  remote: Fields;
  bidirectional: boolean;
  pushable: ReadonlySet<string>;
  policy: ConflictPolicy;
  dismissed?: Record<string, string>;
}): MergeResult {
  const { base, local, remote, bidirectional, pushable, policy, dismissed = {} } = input;
  const out: MergeResult = { localPatch: {}, remotePatch: {}, conflicts: [], base: { ...(base || {}) }, keptLocal: [] };

  for (const field of Object.keys(remote)) {
    const r = remote[field];
    if (r === undefined) continue;
    const l = local[field] ?? null;
    const known = base !== undefined && Object.prototype.hasOwnProperty.call(base, field);
    const b = known ? base![field] : undefined;

    if (same(l, r)) {
      out.base[field] = r;
      continue;
    }
    const canPush = bidirectional && pushable.has(field);

    if (known && same(l, b)) {
      // only the source changed
      out.localPatch[field] = r;
      out.base[field] = r;
      continue;
    }
    if (known && same(r, b)) {
      // only the local copy changed
      if (canPush) {
        out.remotePatch[field] = l;
        out.base[field] = l;
      } else {
        out.keptLocal.push(field);
      }
      continue;
    }
    // both changed (or there is no common ancestor to tell who did)
    if (dismissed[field] === pairHash(l, r)) {
      out.keptLocal.push(field);
      continue;
    }
    if (policy === 'source_wins') {
      out.localPatch[field] = r;
      out.base[field] = r;
    } else if (policy === 'destination_wins') {
      if (canPush) {
        out.remotePatch[field] = l;
        out.base[field] = l;
      } else {
        out.base[field] = r; // the source value has been seen and rejected
        out.keptLocal.push(field);
      }
    } else {
      out.conflicts.push({ field, baseValue: b ?? null, sourceValue: r, localValue: l });
    }
  }
  return out;
}
