import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sensorReading } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('sensors', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('stores a reading, lists it and reports duplicates on re-upload', async () => {
    const reading = sensorReading({ position: { x: 1, y: 2, z: 0, frame: 'IMU_DEAD_RECKONING', confidence: 0.2 } });
    const first = await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: reading });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ accepted: [reading.id], duplicates: [] });

    const again = await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: reading });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ accepted: [], duplicates: [reading.id] });

    const list = await t.app.inject({ method: 'GET', url: '/api/sensors?limit=10', headers: t.headers });
    expect(list.statusCode).toBe(200);
    const body = list.json();
    expect(body.latest).toEqual(reading);
    expect(body.readings).toHaveLength(1);
    expect(body.readings[0].position).toEqual(reading.position);
  });

  it('accepts an array and filters by missionId and since', async () => {
    const old = sensorReading({ missionId: 'm1', timestamp: '2020-01-01T00:00:00.000Z' });
    const fresh = sensorReading({ missionId: 'm1', timestamp: '2030-01-01T00:00:00.000Z', temperatureC: null });
    const res = await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: [old, fresh] });
    expect(res.json().accepted).toEqual([old.id, fresh.id]);

    const byMission = await t.app.inject({ method: 'GET', url: '/api/sensors?missionId=m1', headers: t.headers });
    expect(byMission.json().readings.map((r: { id: string }) => r.id)).toEqual([fresh.id, old.id]);

    const since = await t.app.inject({ method: 'GET', url: '/api/sensors?missionId=m1&since=2025-01-01T00:00:00Z', headers: t.headers });
    expect(since.json().readings.map((r: { id: string }) => r.id)).toEqual([fresh.id]);
    expect(since.json().readings[0].temperatureC).toBeNull();
  });

  it('rejects invalid readings with zod issues', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: { id: 'x', source: 'FAKE' } });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('validation_failed');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });
});
