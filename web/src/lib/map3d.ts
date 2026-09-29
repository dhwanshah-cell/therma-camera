import type { ThermalPoint } from '@robodog/shared';
import { intensityToRgb, temperatureRange, temperatureToIntensity } from './palette';

export interface TrajectorySample {
  x: number;
  y: number;
  z: number | null;
  timestamp: string;
}

export interface PointGeometryResult {
  /** xyz triplets for points that have a real z value. */
  positions: Float32Array;
  /** rgb triplets (0..1) matching `positions`. */
  colors: Float32Array;
  /** Index into the original `points` array for each rendered vertex. */
  sourceIndex: number[];
  count: number;
  /** True when no point carries depth (z). Nothing must be rendered in that case. */
  waitingForDepth: boolean;
  /** Whether colours were derived from temperature (true) or intensity (false). */
  coloredByTemperature: boolean;
  temperatureRange: { min: number; max: number } | null;
}

function hasZ(p: { z: number | null | undefined }): p is { z: number } {
  return typeof p.z === 'number' && Number.isFinite(p.z);
}

/**
 * Build the vertex buffers for the 3D point cloud. Only points with a numeric z are included:
 * a depth-less map has no 3D geometry and must not be fabricated.
 */
export function buildPointGeometry(
  points: ReadonlyArray<ThermalPoint>,
  opts: { useTemperature?: boolean } = {},
): PointGeometryResult {
  const withZ: { p: ThermalPoint; i: number }[] = [];
  points.forEach((p, i) => {
    if (hasZ(p) && Number.isFinite(p.x) && Number.isFinite(p.y)) withZ.push({ p, i });
  });
  const range = opts.useTemperature ? temperatureRange(withZ.map((w) => w.p.temperature)) : null;
  const coloredByTemperature = Boolean(opts.useTemperature && range && range.max > range.min);

  const positions = new Float32Array(withZ.length * 3);
  const colors = new Float32Array(withZ.length * 3);
  const sourceIndex: number[] = new Array(withZ.length);
  withZ.forEach(({ p, i }, k) => {
    positions[k * 3] = p.x;
    positions[k * 3 + 1] = p.y;
    positions[k * 3 + 2] = p.z as number;
    let t: number | null = null;
    if (coloredByTemperature && range && typeof p.temperature === 'number') {
      t = temperatureToIntensity(p.temperature, range.min, range.max);
    }
    if (t === null) t = p.thermalIntensity;
    const [r, g, b] = intensityToRgb(t);
    colors[k * 3] = r / 255;
    colors[k * 3 + 1] = g / 255;
    colors[k * 3 + 2] = b / 255;
    sourceIndex[k] = i;
  });

  return {
    positions,
    colors,
    sourceIndex,
    count: withZ.length,
    waitingForDepth: withZ.length === 0,
    coloredByTemperature,
    temperatureRange: coloredByTemperature ? range : null,
  };
}

/** Trajectory samples with z become a 3D polyline; samples without z are skipped (never guessed). */
export function buildTrajectoryPositions(trajectory: ReadonlyArray<TrajectorySample>): Float32Array {
  const pts = trajectory.filter((t) => hasZ(t) && Number.isFinite(t.x) && Number.isFinite(t.y));
  const out = new Float32Array(pts.length * 3);
  pts.forEach((t, k) => {
    out[k * 3] = t.x;
    out[k * 3 + 1] = t.y;
    out[k * 3 + 2] = t.z as number;
  });
  return out;
}

/** Indices (into `points`) of the hottest points by intensity or temperature. */
export function selectHotspots(points: ReadonlyArray<ThermalPoint>, threshold = 0.85, max = 50): number[] {
  const scored: { i: number; s: number }[] = [];
  const range = temperatureRange(points.map((p) => p.temperature));
  points.forEach((p, i) => {
    let s = p.thermalIntensity;
    if (range && typeof p.temperature === 'number') {
      const t = temperatureToIntensity(p.temperature, range.min, range.max);
      if (t !== null) s = t;
    }
    if (s >= threshold) scored.push({ i, s });
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, max).map((x) => x.i);
}

export function boundsOf(positions: Float32Array): { center: [number, number, number]; radius: number } | null {
  if (positions.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!;
    const y = positions[i + 1]!;
    const z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const center: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1) / 2;
  return { center, radius };
}
