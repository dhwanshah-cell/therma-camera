import type { Position } from '@robodog/shared';

/** Column set used by every table that stores an optional {@link Position}. */
export interface PositionColumns {
  x: number | null;
  y: number | null;
  z: number | null;
  position_frame: string | null;
  position_confidence: number | null;
}

export function positionToColumns(p: Position | null): PositionColumns {
  return {
    x: p?.x ?? null,
    y: p?.y ?? null,
    z: p?.z ?? null,
    position_frame: p?.frame ?? null,
    position_confidence: p?.confidence ?? null,
  };
}

export function positionFromColumns(r: PositionColumns): Position | null {
  if (r.x === null || r.y === null || r.z === null || r.position_frame === null) return null;
  return {
    x: r.x,
    y: r.y,
    z: r.z,
    frame: r.position_frame as Position['frame'],
    confidence: r.position_confidence,
  };
}

export const bool = (v: boolean | null | undefined): number | null => (v === null || v === undefined ? null : v ? 1 : 0);
export const fromBool = (v: number | null): boolean | null => (v === null ? null : v !== 0);
export const nowIso = (): string => new Date().toISOString();

/**
 * Timestamps are compared as strings in SQL, so every stored or queried value is normalised to
 * UTC ISO-8601 with milliseconds (`2026-09-29T10:00:00.000Z`). Unparseable input is kept as-is.
 */
export function normalizeTimestamp(value: string): string {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/** Normalise an optional query timestamp (since/from/to). */
export function normalizeOptionalTimestamp(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeTimestamp(value);
}

export function parseJson<T>(text: string | null, fallback: T): T {
  if (text === null || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Clamp a user supplied limit into a sane range. */
export function clampLimit(value: unknown, fallback: number, max = 5000): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/** Result of an idempotent insert keyed by the client-generated id. */
export type InsertResult = 'accepted' | 'duplicate';
