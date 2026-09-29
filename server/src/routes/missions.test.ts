import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sensorReading, thermalImage } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('missions', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('creates missions with sequential numbers and a single active mission per source', async () => {
    const first = await t.app.inject({ method: 'POST', url: '/api/missions', headers: t.headers, payload: { name: 'Alpha' } });
    expect(first.statusCode).toBe(201);
    const m1 = first.json();
    expect(m1.number).toBe(1);
    expect(m1.id).toMatch(/^mission_/);
    expect(m1.status).toBe('ACTIVE');
    expect(m1.source).toBe('REAL');
    expect(m1.stats).toEqual({ thermalImages: 0, rgbImages: 0, videos: 0, sensorReadings: 0, gasAlerts: 0, thermalHotspots: 0, maps: 0 });

    const second = await t.app.inject({ method: 'POST', url: '/api/missions', headers: t.headers, payload: { id: 'mission_custom', name: 'Bravo' } });
    const m2 = second.json();
    expect(m2.number).toBe(2);
    expect(m2.id).toBe('mission_custom');

    const m1Again = (await t.app.inject({ method: 'GET', url: `/api/missions/${m1.id}`, headers: t.headers })).json();
    expect(m1Again.status).toBe('COMPLETED');
    expect(m1Again.endTime).not.toBeNull();

    // A simulated mission does not interfere with the real active one.
    const sim = await t.app.inject({ method: 'POST', url: '/api/missions', headers: t.headers, payload: { name: 'Sim', source: 'SIMULATION' } });
    expect(sim.json().number).toBe(3);
    const m2Again = (await t.app.inject({ method: 'GET', url: `/api/missions/${m2.id}`, headers: t.headers })).json();
    expect(m2Again.status).toBe('ACTIVE');

    const list = (await t.app.inject({ method: 'GET', url: '/api/missions', headers: t.headers })).json();
    expect(list.map((m: { number: number }) => m.number)).toEqual([3, 2, 1]);
    const active = (await t.app.inject({ method: 'GET', url: '/api/missions?status=ACTIVE&source=REAL', headers: t.headers })).json();
    expect(active.map((m: { id: string }) => m.id)).toEqual([m2.id]);
  });

  it('re-posting an existing id is a no-op', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/missions', headers: t.headers, payload: { id: 'mission_custom', name: 'Changed' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Bravo');
  });

  it('patches a mission and computes stats from related rows', async () => {
    await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: sensorReading({ missionId: 'mission_custom' }) });
    await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: thermalImage({ missionId: 'mission_custom' }) });
    const patched = await t.app.inject({
      method: 'PATCH',
      url: '/api/missions/mission_custom',
      headers: t.headers,
      payload: { status: 'COMPLETED', notes: 'done' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().status).toBe('COMPLETED');
    expect(patched.json().notes).toBe('done');
    expect(patched.json().endTime).not.toBeNull();
    expect(patched.json().stats.sensorReadings).toBe(1);
    expect(patched.json().stats.thermalImages).toBe(1);

    const summary = await t.app.inject({ method: 'GET', url: '/api/missions/mission_custom/summary', headers: t.headers });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().sensorCount).toBe(1);
    expect(summary.json().thermalImages).toHaveLength(1);
    expect(summary.json().alerts).toEqual([]);
  });

  it('validates patches and 404s unknown ids', async () => {
    const bad = await t.app.inject({ method: 'PATCH', url: '/api/missions/mission_custom', headers: t.headers, payload: { status: 'PAUSED' } });
    expect(bad.statusCode).toBe(400);
    const missing = await t.app.inject({ method: 'GET', url: '/api/missions/nope', headers: t.headers });
    expect(missing.statusCode).toBe(404);
    const missingPatch = await t.app.inject({ method: 'PATCH', url: '/api/missions/nope', headers: t.headers, payload: { name: 'x' } });
    expect(missingPatch.statusCode).toBe(404);
  });
});
