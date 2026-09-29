import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { imuSample, robotStatus } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('robot status and imu', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('reports null fields (never fabricated values) before anything was reported', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/robot', headers: t.headers });
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s.reported).toBe(false);
    expect(s.phoneConnected).toBe(false);
    expect(s.batteryPct).toBeNull();
    expect(s.esp32Connected).toBeNull();
    expect(s.thermalCameraConnected).toBeNull();
    expect(s.robotConnected).toBeNull();
    expect(s.imuAvailable).toBeNull();
    expect(s.lidarAvailable).toBeNull();
    expect(s.moving).toBeNull();
    expect(s.gps).toBeNull();
    expect(s.activeMissionId).toBeNull();
    expect(s.lastPhoneSeen).toBeNull();
    expect(s.source).toBe('REAL');
  });

  it('stores reported status and returns the latest', async () => {
    const first = robotStatus({ batteryPct: 90 });
    const second = robotStatus({ batteryPct: 88, gps: { lat: 1, lon: 2, altitude: null, accuracyM: 5 }, extra: { note: 'x' } });
    expect((await t.app.inject({ method: 'POST', url: '/api/robot', headers: t.headers, payload: first })).statusCode).toBe(201);
    expect((await t.app.inject({ method: 'POST', url: '/api/robot', headers: t.headers, payload: second })).statusCode).toBe(201);
    const res = await t.app.inject({ method: 'GET', url: '/api/robot', headers: t.headers });
    const s = res.json();
    expect(s.reported).toBe(true);
    expect(s.batteryPct).toBe(88);
    expect(s.gps).toEqual(second.gps);
    expect(s.extra).toEqual({ note: 'x' });
    // Presence comes from the WebSocket hub, not from the phone's own claim.
    expect(s.phoneConnected).toBe(false);
    const history = await t.app.inject({ method: 'GET', url: '/api/robot/history', headers: t.headers });
    expect(history.json()).toHaveLength(2);
    const bad = await t.app.inject({ method: 'POST', url: '/api/robot', headers: t.headers, payload: { ...first, batteryPct: 'full' } });
    expect(bad.statusCode).toBe(400);
  });

  it('bulk inserts IMU samples with a 5000 cap', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/imu', headers: t.headers, payload: { samples: [imuSample(), imuSample(), imuSample()] } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ count: 3 });
    const tooMany = { samples: Array.from({ length: 5001 }, () => imuSample()) };
    const big = await t.app.inject({ method: 'POST', url: '/api/imu', headers: t.headers, payload: tooMany });
    expect(big.statusCode).toBe(400);
    expect(t.app.repos.imu.count()).toBe(3);
  });

  it('lists robot events', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/robot/events?limit=5', headers: t.headers });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
