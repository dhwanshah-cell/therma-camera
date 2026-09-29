import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SyncBatchRequest, SyncEnvelope } from '@robodog/shared';
import { alert, imuSample, mapUpload, rgbImage, robotStatus, sensorReading, thermalImage, video } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

function envelope(kind: SyncEnvelope['kind'], id: string, payload: unknown): SyncEnvelope {
  return { id, kind, payload, createdAt: new Date().toISOString(), attempts: 0 };
}

describe('sync batch', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('accepts a mixed batch once and reports duplicates on replay', async () => {
    const reading = sensorReading({ id: 'sensor_s1' });
    const a = alert({ id: 'alert_s1' });
    const ti = thermalImage({ id: 'thermal_s1' });
    const ri = rgbImage({ id: 'rgb_s1' });
    const v = video({ id: 'video_s1' });
    const m = mapUpload({ id: 'map_s1' });
    const mission = {
      id: 'mission_s1',
      number: 42,
      name: 'Phone mission',
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'ACTIVE',
      notes: null,
      source: 'REAL',
      stats: { thermalImages: 0, rgbImages: 0, videos: 0, sensorReadings: 0, gasAlerts: 0, thermalHotspots: 0, maps: 0 },
    };
    const batch: SyncBatchRequest = {
      deviceId: 'phone-1',
      items: [
        envelope('sensor', 'sensor_s1', reading),
        envelope('alert', 'alert_s1', a),
        envelope('thermal_image', 'thermal_s1', ti),
        envelope('rgb_image', 'rgb_s1', ri),
        envelope('video', 'video_s1', v),
        envelope('map', 'map_s1', m),
        envelope('mission', 'mission_s1', mission),
        envelope('robot', 'robot_s1', robotStatus()),
        envelope('imu_batch', 'imu_s1', { samples: [imuSample(), imuSample()] }),
        envelope('sensor', 'sensor_bad', { id: 'x' }),
      ],
    };
    const first = await t.app.inject({ method: 'POST', url: '/api/sync', headers: t.headers, payload: batch });
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.accepted).toEqual(['sensor_s1', 'alert_s1', 'thermal_s1', 'rgb_s1', 'video_s1', 'map_s1', 'mission_s1', 'robot_s1', 'imu_s1']);
    expect(body.duplicates).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0].id).toBe('sensor_bad');
    expect(body.rejected[0].reason).toContain('timestamp');

    // Server assigns its own sequential number; the phone's number is not trusted.
    const stored = (await t.app.inject({ method: 'GET', url: '/api/missions/mission_s1', headers: t.headers })).json();
    expect(stored.number).toBe(1);
    expect(stored.name).toBe('Phone mission');

    const replay = await t.app.inject({ method: 'POST', url: '/api/sync', headers: t.headers, payload: batch });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().accepted).toEqual([]);
    expect(replay.json().duplicates).toEqual(['sensor_s1', 'alert_s1', 'thermal_s1', 'rgb_s1', 'video_s1', 'map_s1', 'mission_s1', 'robot_s1', 'imu_s1']);
    expect(replay.json().rejected).toHaveLength(1);

    // Nothing was inserted twice.
    expect((await t.app.inject({ method: 'GET', url: '/api/sensors', headers: t.headers })).json().readings).toHaveLength(1);
    expect((await t.app.inject({ method: 'GET', url: '/api/alerts', headers: t.headers })).json()).toHaveLength(1);
    const stats = (await t.app.inject({ method: 'GET', url: '/api/stats', headers: t.headers })).json();
    expect(stats.imuSamples).toBe(2);
    expect(stats.thermalImages).toBe(1);
    expect(stats.maps).toBe(1);
  });

  it('a record already uploaded through its own endpoint is a duplicate in a later batch', async () => {
    const reading = sensorReading({ id: 'sensor_direct' });
    await t.app.inject({ method: 'POST', url: '/api/sensors', headers: t.headers, payload: reading });
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: t.headers,
      payload: { deviceId: 'phone-1', items: [envelope('sensor', 'env_direct', reading)] },
    });
    expect(res.json().duplicates).toEqual(['env_direct']);
  });

  it('a mission re-sent with a new status updates the stored mission', async () => {
    const completed = {
      id: 'mission_s1',
      number: 42,
      name: 'Phone mission',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      status: 'COMPLETED',
      notes: 'finished',
      source: 'REAL',
      stats: { thermalImages: 0, rgbImages: 0, videos: 0, sensorReadings: 0, gasAlerts: 0, thermalHotspots: 0, maps: 0 },
    };
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/sync',
      headers: t.headers,
      payload: { deviceId: 'phone-1', items: [envelope('mission', 'mission_s1_done', completed)] },
    });
    expect(res.json().duplicates).toEqual(['mission_s1_done']);
    const stored = (await t.app.inject({ method: 'GET', url: '/api/missions/mission_s1', headers: t.headers })).json();
    expect(stored.status).toBe('COMPLETED');
    expect(stored.notes).toBe('finished');
  });

  it('validates the batch envelope', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/sync', headers: t.headers, payload: { items: [] } });
    expect(res.statusCode).toBe(400);
  });
});
