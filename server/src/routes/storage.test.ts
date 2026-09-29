import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapUpload, rgbImage, thermalImage, video } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('storage listing and stats', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    const h = t.headers;
    await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: h, payload: thermalImage({ id: 'ti', timestamp: '2026-01-04T00:00:00.000Z', missionId: 'm' }) });
    await t.app.inject({ method: 'POST', url: '/api/rgb/images', headers: h, payload: rgbImage({ id: 'ri', timestamp: '2026-01-03T00:00:00.000Z' }) });
    await t.app.inject({ method: 'POST', url: '/api/thermal/videos', headers: h, payload: video({ id: 'tv', kind: 'THERMAL', timestamp: '2026-01-02T00:00:00.000Z' }) });
    await t.app.inject({ method: 'POST', url: '/api/rgb/videos', headers: h, payload: video({ id: 'rv', kind: 'RGB', timestamp: '2026-01-05T00:00:00.000Z', missionId: 'm' }) });
    await t.app.inject({ method: 'POST', url: '/api/maps', headers: h, payload: mapUpload({ id: 'mp', timestamp: '2026-01-01T00:00:00.000Z' }) });
  });
  afterAll(() => t.close());

  it('returns every media kind newest first', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/storage', headers: t.headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((e: { mediaType: string; item: { id: string } }) => [e.mediaType, e.item.id])).toEqual([
      ['RGB_VIDEO', 'rv'],
      ['THERMAL_IMAGE', 'ti'],
      ['RGB_IMAGE', 'ri'],
      ['THERMAL_VIDEO', 'tv'],
      ['THERMAL_MAP', 'mp'],
    ]);
  });

  it('filters by type, mission and time range and honours limit', async () => {
    const byType = await t.app.inject({ method: 'GET', url: '/api/storage?type=THERMAL_VIDEO', headers: t.headers });
    expect(byType.json()).toEqual([{ mediaType: 'THERMAL_VIDEO', item: expect.objectContaining({ id: 'tv' }) }]);
    const byMission = await t.app.inject({ method: 'GET', url: '/api/storage?missionId=m', headers: t.headers });
    expect(byMission.json().map((e: { item: { id: string } }) => e.item.id)).toEqual(['rv', 'ti']);
    const range = await t.app.inject({ method: 'GET', url: '/api/storage?from=2026-01-02T00:00:00Z&to=2026-01-03T12:00:00Z', headers: t.headers });
    expect(range.json().map((e: { item: { id: string } }) => e.item.id)).toEqual(['ri', 'tv']);
    const limited = await t.app.inject({ method: 'GET', url: '/api/storage?limit=2', headers: t.headers });
    expect(limited.json()).toHaveLength(2);
    const bad = await t.app.inject({ method: 'GET', url: '/api/storage?type=NOPE', headers: t.headers });
    expect(bad.statusCode).toBe(400);
  });

  it('GET /api/stats counts everything', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/stats', headers: t.headers });
    const s = res.json();
    expect(s.thermalImages).toBe(1);
    expect(s.rgbImages).toBe(1);
    expect(s.thermalVideos).toBe(1);
    expect(s.rgbVideos).toBe(1);
    expect(s.maps).toBe(1);
    expect(s.simulation).toBe(false);
    expect(s.phoneConnected).toBe(false);
    expect(s.activeMission).toBeNull();
  });
});
