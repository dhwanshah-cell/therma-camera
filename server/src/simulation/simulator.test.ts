import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decode } from 'jpeg-js';
import { decodeLiveFrame, type WsServerMessage } from '@robodog/shared';
import { SIMULATION_MISSION_NAME } from './simulator.js';
import { renderSyntheticThermalJpeg } from './thermalFrame.js';
import { connectWs, createTestApp, type TestApp } from '../test/helpers.js';

describe('simulation mode', () => {
  let t: TestApp;
  let baseUrl: string;
  beforeAll(async () => {
    t = await createTestApp({ simulation: true }, { simulator: { sensorIntervalMs: 40, robotIntervalMs: 60, frameIntervalMs: 50, random: () => 0.01 } });
    baseUrl = await t.listen();
  });
  afterAll(() => t.close());

  it('renders a real 256x192 JPEG', () => {
    const jpeg = renderSyntheticThermalJpeg({ phase: 1 });
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    const decoded = decode(jpeg);
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(192);
  });

  it('reports simulation in health and creates the SIMULATION MISSION', async () => {
    const health = await t.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.json().simulation).toBe(true);
    const missions = (await t.app.inject({ method: 'GET', url: '/api/missions', headers: t.headers })).json();
    expect(missions).toHaveLength(1);
    expect(missions[0].name).toBe(SIMULATION_MISSION_NAME);
    expect(missions[0].source).toBe('SIMULATION');
    expect(missions[0].status).toBe('ACTIVE');
  });

  it('every generated record is labelled SIMULATION', async () => {
    await new Promise((r) => setTimeout(r, 200));
    const sensors = (await t.app.inject({ method: 'GET', url: '/api/sensors?limit=50', headers: t.headers })).json();
    expect(sensors.readings.length).toBeGreaterThan(1);
    for (const r of sensors.readings) {
      expect(r.source).toBe('SIMULATION');
      expect(r.id).toMatch(/^sim_sensor_/);
      expect(r.temperatureC).toBeGreaterThanOrEqual(20);
      expect(r.temperatureC).toBeLessThanOrEqual(35);
      expect(r.humidityPct).toBeGreaterThanOrEqual(40);
      expect(r.humidityPct).toBeLessThanOrEqual(70);
      expect(r.position.frame).toBe('IMU_DEAD_RECKONING');
      expect(r.position.confidence).toBe(0.2);
      expect(r.missionId).toBe(t.app.simulator?.missionId);
    }
    // random() = 0.01 forces the gas alert branch every tick.
    const alerts = (await t.app.inject({ method: 'GET', url: '/api/alerts', headers: t.headers })).json();
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(a.source).toBe('SIMULATION');
      expect(a.message.startsWith('[SIMULATION] ')).toBe(true);
      expect(['GAS_ALERT', 'THERMAL_INTENSITY_HOTSPOT']).toContain(a.type);
    }
    const robot = (await t.app.inject({ method: 'GET', url: '/api/robot', headers: t.headers })).json();
    expect(robot.reported).toBe(true);
    expect(robot.source).toBe('SIMULATION');
    expect(robot.batteryPct).toBeLessThanOrEqual(100);
    expect(robot.extra.position.frame).toBe('IMU_DEAD_RECKONING');
    expect(robot.extra.position.confidence).toBe(0.2);
  });

  it('streams a simulated, non-radiometric thermal frame over the websocket', async () => {
    const web = await connectWs(baseUrl);
    web.send({ type: 'hello', role: 'web', deviceId: 'web-sim' });
    const welcome = await web.next<Extract<WsServerMessage, { type: 'welcome' }>>((m) => m.type === 'welcome');
    expect(welcome.simulation).toBe(true);
    web.send({ type: 'subscribe', channels: ['thermal'] });
    const frame = decodeLiveFrame(await web.nextBinary());
    expect(frame).not.toBeNull();
    expect(frame!.header.source).toBe('SIMULATION');
    expect(frame!.header.radiometric).toBe(false);
    expect(frame!.header.centerTemperature).toBeNull();
    expect(frame!.header.width).toBe(256);
    expect(frame!.header.height).toBe(192);
    const decoded = decode(Buffer.from(frame!.jpeg));
    expect(decoded.width).toBe(256);
    const sensor = await web.next<Extract<WsServerMessage, { type: 'sensor' }>>((m) => m.type === 'sensor');
    expect(sensor.reading.source).toBe('SIMULATION');
    await web.close();
  });

  it('never runs when the flag is off', async () => {
    const off = await createTestApp();
    await off.app.ready();
    await new Promise((r) => setTimeout(r, 100));
    expect(off.app.simulator).toBeNull();
    expect((await off.app.inject({ method: 'GET', url: '/api/sensors', headers: off.headers })).json().readings).toHaveLength(0);
    expect((await off.app.inject({ method: 'GET', url: '/api/missions', headers: off.headers })).json()).toHaveLength(0);
    await off.close();
  });
});
