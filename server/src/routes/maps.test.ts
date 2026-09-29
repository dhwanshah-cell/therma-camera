import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapUpload } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('thermal maps', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('stores metadata in sqlite and points in a JSON file, then serves them back', async () => {
    const upload = mapUpload({ id: 'map_1', missionId: 'mission_m' });
    const res = await t.app.inject({ method: 'POST', url: '/api/maps', headers: t.headers, payload: upload });
    expect(res.statusCode).toBe(201);
    expect(res.json().item.pointCount).toBe(2);
    expect(res.json().item.filePath).toBe('/media/maps/map_1.json');
    expect(res.json().item).not.toHaveProperty('points');
    expect(fs.existsSync(path.join(t.mediaDir, 'maps', 'map_1.json'))).toBe(true);

    const dup = await t.app.inject({ method: 'POST', url: '/api/maps', headers: t.headers, payload: upload });
    expect(dup.json().result).toBe('duplicate');

    const list = await t.app.inject({ method: 'GET', url: '/api/maps?missionId=mission_m', headers: t.headers });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].bounds).toEqual(upload.bounds);

    const full = await t.app.inject({ method: 'GET', url: '/api/maps/map_1', headers: t.headers });
    expect(full.statusCode).toBe(200);
    expect(full.json().points).toEqual(upload.points);
    expect(full.json().trajectory).toEqual(upload.trajectory);
    expect(full.json().name).toBe('Test map');

    const del = await t.app.inject({ method: 'DELETE', url: '/api/maps/map_1', headers: t.headers });
    expect(del.statusCode).toBe(200);
    expect(fs.existsSync(path.join(t.mediaDir, 'maps', 'map_1.json'))).toBe(false);
    expect((await t.app.inject({ method: 'GET', url: '/api/maps/map_1', headers: t.headers })).statusCode).toBe(404);
  });

  it('rejects out-of-range thermal intensity', async () => {
    const bad = mapUpload({ id: 'map_bad' });
    bad.points[0]!.thermalIntensity = 1.5;
    const res = await t.app.inject({ method: 'POST', url: '/api/maps', headers: t.headers, payload: bad });
    expect(res.statusCode).toBe(400);
  });
});
