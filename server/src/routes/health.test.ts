import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_HEADER } from '@robodog/shared';
import { createTestApp, TEST_TOKEN, type TestApp } from '../test/helpers.js';

describe('health and auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('GET /api/health needs no token and reports simulation=false', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.simulation).toBe(false);
    expect(typeof body.version).toBe('string');
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it('rejects /api routes without a token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/sensors' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects a wrong token', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/sensors', headers: { [AUTH_HEADER]: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the x-robodog-token header, a Bearer token and ?token=', async () => {
    const a = await t.app.inject({ method: 'GET', url: '/api/sensors', headers: { [AUTH_HEADER]: TEST_TOKEN } });
    const b = await t.app.inject({ method: 'GET', url: '/api/sensors', headers: { authorization: `Bearer ${TEST_TOKEN}` } });
    const c = await t.app.inject({ method: 'GET', url: `/api/sensors?token=${TEST_TOKEN}` });
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([200, 200, 200]);
  });

  it('protects /media files', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/media/RoboDog/Thermal/Images/x.jpg' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 JSON for unknown routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/nope', headers: t.headers });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });
});
