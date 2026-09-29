import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alertFromReading, esp32PayloadToReading } from '../esp32.js';
import { alert } from '../test/fixtures.js';
import { createTestApp, type TestApp } from '../test/helpers.js';

describe('alerts', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('stores an alert generated from an ESP32 gas alert and acknowledges it', async () => {
    const reading = esp32PayloadToReading({ temperature: 31, humidity: 58, gas_raw: 2700, gas_alert: true }, { missionId: 'mission_a' });
    const generated = alertFromReading(reading)!;
    const res = await t.app.inject({ method: 'POST', url: '/api/alerts', headers: t.headers, payload: generated });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ accepted: [generated.id], duplicates: [] });

    const dup = await t.app.inject({ method: 'POST', url: '/api/alerts', headers: t.headers, payload: [generated] });
    expect(dup.json().duplicates).toEqual([generated.id]);

    const list = await t.app.inject({ method: 'GET', url: '/api/alerts?type=GAS_ALERT&acknowledged=false', headers: t.headers });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toEqual(generated);

    const ack = await t.app.inject({ method: 'POST', url: `/api/alerts/${generated.id}/acknowledge`, headers: t.headers });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().acknowledged).toBe(true);

    const unacked = await t.app.inject({ method: 'GET', url: '/api/alerts?acknowledged=false', headers: t.headers });
    expect(unacked.json()).toHaveLength(0);
    const acked = await t.app.inject({ method: 'GET', url: '/api/alerts?acknowledged=true&missionId=mission_a', headers: t.headers });
    expect(acked.json().map((a: { id: string }) => a.id)).toEqual([generated.id]);
  });

  it('filters by severity and applies schema defaults', async () => {
    const warn = alert({ severity: 'WARNING', type: 'THERMAL_INTENSITY_HOTSPOT' });
    // metadata/acknowledged omitted: defaults must apply.
    const { metadata: _m, acknowledged: _a, thermalImageId: _t, rgbImageId: _r, ...partial } = warn;
    const res = await t.app.inject({ method: 'POST', url: '/api/alerts', headers: t.headers, payload: partial });
    expect(res.statusCode).toBe(201);
    const list = await t.app.inject({ method: 'GET', url: '/api/alerts?severity=WARNING', headers: t.headers });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0].metadata).toEqual({});
    expect(list.json()[0].acknowledged).toBe(false);
    expect(list.json()[0].thermalImageId).toBeNull();
  });

  it('404s when acknowledging an unknown alert and 400s on a bad type filter', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/alerts/nope/acknowledge', headers: t.headers });
    expect(res.statusCode).toBe(404);
    const bad = await t.app.inject({ method: 'GET', url: '/api/alerts?type=BOGUS', headers: t.headers });
    expect(bad.statusCode).toBe(400);
  });
});
