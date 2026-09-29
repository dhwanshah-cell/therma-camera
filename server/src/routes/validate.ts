import type { ZodTypeAny, z } from 'zod';
import { ValidationError } from '../errors.js';
import { clampLimit } from '../db/repositories/common.js';

/** Parse with a shared zod schema; failures become HTTP 400 with the zod issues. */
export function parseWith<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
}

/** Accept either a single record or an array of records. */
export function parseOneOrMany<S extends ZodTypeAny>(schema: S, body: unknown): Array<z.infer<S>> {
  const items = Array.isArray(body) ? body : [body];
  return items.map((item) => parseWith(schema, item));
}

export type Query = Record<string, string | undefined>;

export function queryString(q: Query, key: string): string | undefined {
  const v = q[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function queryLimit(q: Query, fallback: number, max = 5000): number {
  return clampLimit(q.limit, fallback, max);
}

export function queryBool(q: Query, key: string): boolean | undefined {
  const v = queryString(q, key);
  if (v === undefined) return undefined;
  const lower = v.toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  return undefined;
}
