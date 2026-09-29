import { describe, expect, it } from 'vitest';
import type { ThermalPoint } from '@robodog/shared';
import { buildPointGeometry, buildTrajectoryPositions } from './map3d';

const base = { thermalIntensity: 0.5, temperature: null, timestamp: '2026-09-29T12:00:00Z', frameId: 'f' };

describe('buildPointGeometry', () => {
  it('returns 0 points and waitingForDepth when no point has z', () => {
    const points: ThermalPoint[] = [
      { ...base, x: 0, y: 0, z: null },
      { ...base, x: 1, y: 2, z: null },
    ];
    const geo = buildPointGeometry(points);
    expect(geo.count).toBe(0);
    expect(geo.positions.length).toBe(0);
    expect(geo.waitingForDepth).toBe(true);
    expect(buildPointGeometry([]).waitingForDepth).toBe(true);
  });

  it('only includes points with numeric z and keeps source indices', () => {
    const points: ThermalPoint[] = [
      { ...base, x: 0, y: 0, z: null },
      { ...base, x: 1, y: 2, z: 3, thermalIntensity: 1 },
      { ...base, x: 4, y: 5, z: 0.5, thermalIntensity: 0 },
    ];
    const geo = buildPointGeometry(points);
    expect(geo.waitingForDepth).toBe(false);
    expect(geo.count).toBe(2);
    expect(Array.from(geo.positions)).toEqual([1, 2, 3, 4, 5, 0.5]);
    expect(geo.sourceIndex).toEqual([1, 2]);
    expect(geo.coloredByTemperature).toBe(false);
    // brightest intensity maps to the top of the ramp, darkest to black
    expect(geo.colors[0]).toBeGreaterThan(0.9);
    expect(geo.colors[3]).toBe(0);
  });

  it('colours by temperature only when temperatures exist', () => {
    const points: ThermalPoint[] = [
      { ...base, x: 0, y: 0, z: 0, temperature: 20 },
      { ...base, x: 1, y: 0, z: 0, temperature: 80 },
    ];
    const geo = buildPointGeometry(points, { useTemperature: true });
    expect(geo.coloredByTemperature).toBe(true);
    expect(geo.temperatureRange).toEqual({ min: 20, max: 80 });
    const noTemp = buildPointGeometry(points.map((p) => ({ ...p, temperature: null })), { useTemperature: true });
    expect(noTemp.coloredByTemperature).toBe(false);
  });

  it('skips trajectory samples without z', () => {
    const traj = buildTrajectoryPositions([
      { x: 0, y: 0, z: null, timestamp: 't' },
      { x: 1, y: 1, z: 1, timestamp: 't' },
    ]);
    expect(Array.from(traj)).toEqual([1, 1, 1]);
  });
});
