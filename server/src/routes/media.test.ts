import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rgbImage, thermalImage, video } from '../test/fixtures.js';
import { createTestApp, multipartBody, TEST_TOKEN, TINY_JPEG, type TestApp } from '../test/helpers.js';

describe('thermal images', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('accepts JSON metadata, dedupes and rejects fabricated temperatures', async () => {
    const img = thermalImage({ id: 'thermal_json' });
    const res = await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: img });
    expect(res.statusCode).toBe(201);
    expect(res.json().result).toBe('accepted');
    expect(res.json().item.uploaded).toBe(false);

    const dup = await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: img });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().result).toBe('duplicate');

    const fake = thermalImage({ radiometric: false, centerTemperature: 36.6 });
    const bad = await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: fake });
    expect(bad.statusCode).toBe(400);
    expect(JSON.stringify(bad.json().issues)).toContain('radiometric');
  });

  it('accepts a multipart upload, serves the file under /media with a token and deletes it', async () => {
    const img = thermalImage({ id: 'thermal_multipart', fileName: '../../evil/thermal 01.jpg' });
    const { body, contentType } = multipartBody([
      { name: 'file', filename: 'thermal.jpg', contentType: 'image/jpeg', data: TINY_JPEG },
      { name: 'metadata', value: JSON.stringify(img) },
    ]);
    const res = await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: { ...t.headers, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(201);
    const item = res.json().item;
    expect(item.uploaded).toBe(true);
    expect(item.sizeBytes).toBe(TINY_JPEG.length);
    expect(item.fileName).toBe('thermal_01.jpg');
    expect(item.filePath).toBe('/media/RoboDog/Thermal/Images/thermal_01.jpg');
    const onDisk = path.join(t.mediaDir, 'RoboDog', 'Thermal', 'Images', 'thermal_01.jpg');
    expect(fs.existsSync(onDisk)).toBe(true);
    expect(fs.existsSync(path.join(t.mediaDir, 'evil'))).toBe(false);

    const noToken = await t.app.inject({ method: 'GET', url: item.filePath });
    expect(noToken.statusCode).toBe(401);
    const served = await t.app.inject({ method: 'GET', url: `${item.filePath}?token=${TEST_TOKEN}` });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toContain('image/jpeg');
    expect(served.rawPayload.equals(TINY_JPEG)).toBe(true);

    const get = await t.app.inject({ method: 'GET', url: `/api/thermal/images/${img.id}`, headers: t.headers });
    expect(get.json().uploaded).toBe(true);

    const del = await t.app.inject({ method: 'DELETE', url: `/api/thermal/images/${img.id}`, headers: t.headers });
    expect(del.statusCode).toBe(200);
    expect(del.json().fileRemoved).toBe(true);
    expect(fs.existsSync(onDisk)).toBe(false);
    const gone = await t.app.inject({ method: 'GET', url: `/api/thermal/images/${img.id}`, headers: t.headers });
    expect(gone.statusCode).toBe(404);
  });

  it('attaches a file later via /:id/file', async () => {
    const img = thermalImage({ id: 'thermal_later', fileName: 'later.jpg' });
    await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: img });
    const { body, contentType } = multipartBody([{ name: 'file', filename: 'ignored.jpg', contentType: 'image/jpeg', data: TINY_JPEG }]);
    const res = await t.app.inject({ method: 'POST', url: `/api/thermal/images/${img.id}/file`, headers: { ...t.headers, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.uploaded).toBe(true);
    expect(res.json().item.filePath).toBe('/media/RoboDog/Thermal/Images/later.jpg');
    const missing = await t.app.inject({ method: 'POST', url: '/api/thermal/images/nope/file', headers: { ...t.headers, 'content-type': contentType }, payload: body });
    expect(missing.statusCode).toBe(404);
  });

  it('lists with filters', async () => {
    await t.app.inject({ method: 'POST', url: '/api/thermal/images', headers: t.headers, payload: thermalImage({ missionId: 'mX', timestamp: '2026-01-01T00:00:00.000Z' }) });
    const list = await t.app.inject({ method: 'GET', url: '/api/thermal/images?missionId=mX&from=2025-12-31T00:00:00Z&to=2026-01-02T00:00:00Z', headers: t.headers });
    expect(list.json()).toHaveLength(1);
    const none = await t.app.inject({ method: 'GET', url: '/api/thermal/images?missionId=mX&from=2026-06-01T00:00:00Z', headers: t.headers });
    expect(none.json()).toHaveLength(0);
  });
});

describe('rgb images and videos', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('stores an RGB image via multipart under RoboDog/RGB/Images', async () => {
    const img = rgbImage({ id: 'rgb_1', fileName: 'rgb_1.jpg', associatedThermalImageId: 'thermal_x' });
    const { body, contentType } = multipartBody([
      { name: 'metadata', value: JSON.stringify(img) },
      { name: 'file', filename: 'rgb_1.jpg', contentType: 'image/jpeg', data: TINY_JPEG },
    ]);
    const res = await t.app.inject({ method: 'POST', url: '/api/rgb/images', headers: { ...t.headers, 'content-type': contentType }, payload: body });
    expect(res.statusCode).toBe(201);
    expect(res.json().item.filePath).toBe('/media/RoboDog/RGB/Images/rgb_1.jpg');
    expect(res.json().item.associatedThermalImageId).toBe('thermal_x');
    expect(fs.existsSync(path.join(t.mediaDir, 'RoboDog', 'RGB', 'Images', 'rgb_1.jpg'))).toBe(true);
    const list = await t.app.inject({ method: 'GET', url: '/api/rgb/images', headers: t.headers });
    expect(list.json()).toHaveLength(1);
    const del = await t.app.inject({ method: 'DELETE', url: '/api/rgb/images/rgb_1', headers: t.headers });
    expect(del.json().fileRemoved).toBe(true);
  });

  it('stores video metadata and enforces the kind per endpoint', async () => {
    const thermal = video({ id: 'vid_t', kind: 'THERMAL' });
    const rgb = video({ id: 'vid_r', kind: 'RGB', palette: null, cameraModel: 'phone-back' });
    const a = await t.app.inject({ method: 'POST', url: '/api/thermal/videos', headers: t.headers, payload: thermal });
    expect(a.statusCode).toBe(201);
    const b = await t.app.inject({ method: 'POST', url: '/api/rgb/videos', headers: t.headers, payload: rgb });
    expect(b.statusCode).toBe(201);
    const wrong = await t.app.inject({ method: 'POST', url: '/api/rgb/videos', headers: t.headers, payload: thermal });
    expect(wrong.statusCode).toBe(400);

    const thermalList = (await t.app.inject({ method: 'GET', url: '/api/thermal/videos', headers: t.headers })).json();
    expect(thermalList.map((v: { id: string }) => v.id)).toEqual(['vid_t']);
    const rgbList = (await t.app.inject({ method: 'GET', url: '/api/rgb/videos', headers: t.headers })).json();
    expect(rgbList.map((v: { id: string }) => v.id)).toEqual(['vid_r']);
    expect(rgbList[0].uploaded).toBe(false);

    const { body, contentType } = multipartBody([{ name: 'file', filename: 'clip.mp4', contentType: 'video/mp4', data: Buffer.from('not really mp4') }]);
    const attach = await t.app.inject({ method: 'POST', url: '/api/thermal/videos/vid_t/file', headers: { ...t.headers, 'content-type': contentType }, payload: body });
    expect(attach.statusCode).toBe(200);
    expect(attach.json().item.filePath).toBe('/media/RoboDog/Thermal/Videos/vid_t.mp4');
    expect(attach.json().item.sizeBytes).toBe(Buffer.byteLength('not really mp4'));

    const del = await t.app.inject({ method: 'DELETE', url: '/api/thermal/videos/vid_t', headers: t.headers });
    expect(del.statusCode).toBe(200);
    expect((await t.app.inject({ method: 'GET', url: '/api/thermal/videos', headers: t.headers })).json()).toHaveLength(0);
  });
});
