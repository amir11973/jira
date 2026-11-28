/**
 * Small dependency-free schema validator used by the data API.
 * Unknown object keys are stripped (not rejected) so older clients keep working.
 */
export type Spec =
  | { t: 'string'; req?: boolean; nullable?: boolean; max?: number; min?: number; oneOf?: readonly string[]; pattern?: RegExp }
  | { t: 'number'; req?: boolean; nullable?: boolean; min?: number; max?: number; int?: boolean }
  | { t: 'boolean'; req?: boolean; nullable?: boolean }
  | { t: 'array'; of: Spec; req?: boolean; max?: number }
  | { t: 'object'; fields: Record<string, Spec>; req?: boolean; nullable?: boolean }
  | { t: 'record'; of: Spec; req?: boolean; max?: number } // string-keyed map
  | { t: 'any'; req?: boolean; nullable?: boolean };

export interface FieldIssue {
  path: string;
  message: string;
}

export const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

type StrOpts = Omit<Extract<Spec, { t: 'string' }>, 't'>;
type NumOpts = Omit<Extract<Spec, { t: 'number' }>, 't'>;

export const S = {
  str: (o: StrOpts = {}): Spec => ({ t: 'string', max: 2000, ...o }),
  text: (o: StrOpts = {}): Spec => ({ t: 'string', max: 100_000, ...o }),
  id: (o: StrOpts = {}): Spec => ({ t: 'string', max: 120, pattern: ID_PATTERN, ...o }),
  num: (o: NumOpts = {}): Spec => ({ t: 'number', ...o }),
  bool: (o: { req?: boolean; nullable?: boolean } = {}): Spec => ({ t: 'boolean', ...o }),
  arr: (of: Spec, o: { req?: boolean; max?: number } = {}): Spec => ({ t: 'array', of, max: 5000, ...o }),
  obj: (fields: Record<string, Spec>, o: { req?: boolean; nullable?: boolean } = {}): Spec => ({
    t: 'object',
    fields,
    ...o,
  }),
  rec: (of: Spec, o: { req?: boolean; max?: number } = {}): Spec => ({ t: 'record', of, max: 500, ...o }),
  any: (o: { req?: boolean; nullable?: boolean } = {}): Spec => ({ t: 'any', ...o }),
  oneOf: (values: readonly string[], o: { req?: boolean; nullable?: boolean } = {}): Spec => ({
    t: 'string',
    oneOf: values,
    max: 80,
    ...o,
  }),
  isoDate: (o: { req?: boolean; nullable?: boolean } = {}): Spec => ({
    t: 'string',
    max: 40,
    pattern: /^\d{4}-\d{2}-\d{2}([T ][\d:.+\-Z]+)?$/,
    ...o,
  }),
};

function validateValue(spec: Spec, value: unknown, path: string, issues: FieldIssue[]): unknown {
  if (value === undefined) {
    if (spec.req) issues.push({ path, message: 'is required' });
    return undefined;
  }
  if (value === null) {
    if ('nullable' in spec && spec.nullable) return null;
    if (spec.req) {
      issues.push({ path, message: 'is required' });
    } else {
      // Treat null on an optional field as "not set".
      return undefined;
    }
    return undefined;
  }

  switch (spec.t) {
    case 'string': {
      if (typeof value !== 'string') {
        issues.push({ path, message: 'must be a string' });
        return undefined;
      }
      if (spec.max !== undefined && value.length > spec.max) {
        issues.push({ path, message: `must be at most ${spec.max} characters` });
        return undefined;
      }
      if (spec.min !== undefined && value.length < spec.min) {
        issues.push({ path, message: `must be at least ${spec.min} characters` });
        return undefined;
      }
      if (spec.req && value.trim() === '' && !spec.nullable) {
        issues.push({ path, message: 'must not be empty' });
        return undefined;
      }
      if (spec.oneOf && !spec.oneOf.includes(value)) {
        issues.push({ path, message: `must be one of: ${spec.oneOf.join(', ')}` });
        return undefined;
      }
      if (spec.pattern && value !== '' && !spec.pattern.test(value)) {
        issues.push({ path, message: 'has an invalid format' });
        return undefined;
      }
      return value;
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, message: 'must be a finite number' });
        return undefined;
      }
      if (spec.int && !Number.isInteger(value)) {
        issues.push({ path, message: 'must be an integer' });
        return undefined;
      }
      if (spec.min !== undefined && value < spec.min) {
        issues.push({ path, message: `must be >= ${spec.min}` });
        return undefined;
      }
      if (spec.max !== undefined && value > spec.max) {
        issues.push({ path, message: `must be <= ${spec.max}` });
        return undefined;
      }
      return value;
    }
    case 'boolean': {
      if (typeof value !== 'boolean') {
        issues.push({ path, message: 'must be a boolean' });
        return undefined;
      }
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        issues.push({ path, message: 'must be an array' });
        return undefined;
      }
      if (spec.max !== undefined && value.length > spec.max) {
        issues.push({ path, message: `must contain at most ${spec.max} items` });
        return undefined;
      }
      const out: unknown[] = [];
      value.forEach((item, idx) => {
        const cleaned = validateValue({ ...spec.of, req: true } as Spec, item, `${path}[${idx}]`, issues);
        if (cleaned !== undefined) out.push(cleaned);
      });
      return out;
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ path, message: 'must be an object' });
        return undefined;
      }
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(spec.fields)) {
        const cleaned = validateValue(sub, (value as Record<string, unknown>)[key], `${path}.${key}`, issues);
        if (cleaned !== undefined) out[key] = cleaned;
      }
      return out;
    }
    case 'record': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ path, message: 'must be an object' });
        return undefined;
      }
      const entries = Object.entries(value as Record<string, unknown>);
      if (spec.max !== undefined && entries.length > spec.max) {
        issues.push({ path, message: `must contain at most ${spec.max} keys` });
        return undefined;
      }
      const out: Record<string, unknown> = {};
      for (const [k, v] of entries) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        const cleaned = validateValue({ ...spec.of, req: false } as Spec, v, `${path}.${k}`, issues);
        if (cleaned !== undefined) out[k] = cleaned;
      }
      return out;
    }
    case 'any':
      return value;
  }
}

export function validate(spec: Spec, value: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; issues: FieldIssue[] } {
  const issues: FieldIssue[] = [];
  const cleaned = validateValue({ ...spec, req: true } as Spec, value, '$', issues);
  if (issues.length > 0 || cleaned === undefined) {
    return { ok: false, issues: issues.length ? issues : [{ path: '$', message: 'is invalid' }] };
  }
  return { ok: true, value: cleaned as Record<string, unknown> };
}
