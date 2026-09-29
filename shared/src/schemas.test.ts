import { describe, expect, it } from 'vitest';
import { esp32SensorPayloadSchema, thermalImageSchema, alertSchema } from './schemas.js';
import { decodeLiveFrame, encodeLiveFrame } from './ws.js';

describe('esp32SensorPayloadSchema', () => {
  it('parses the documented ESP32 payload', () => {
    const parsed = esp32SensorPayloadSchema.parse({ temperature: 28.4, humidity: 61, gas_raw: 1842, gas_alert: false });
    expect(parsed.gas_raw).toBe(1842);
    expect(parsed.gas_alert).toBe(false);
  });
  it('rejects a string temperature', () => {
    expect(() => esp32SensorPayloadSchema.parse({ temperature: '28', humidity: 61, gas_raw: 1, gas_alert: false })).toThrow();
  });
  it('ignores unknown extra fields', () => {
    const parsed = esp32SensorPayloadSchema.parse({ temperature: 1, humidity: 2, gas_raw: 3, gas_alert: true, battery: 90 });
    expect(parsed).toEqual({ temperature: 1, humidity: 2, gas_raw: 3, gas_alert: true });
  });
});

describe('thermalImageSchema', () => {
  const base = {
    id: 'ti_1', timestamp: '2026-09-29T10:00:00.000Z', missionId: null, cameraModel: 'Fluke iSee TC01A',
    width: 256, height: 192, fileName: 'thermal_20260929_100000.jpg', filePath: 'RoboDog/Thermal/Images/thermal_20260929_100000.jpg',
    palette: 'IRON', centerTemperature: null, minTemperature: null, maxTemperature: null, emissivity: null, distance: null,
    x: null, y: null, z: null, source: 'REAL',
  };
  it('accepts null temperatures for a non-radiometric frame', () => {
    expect(thermalImageSchema.parse(base).radiometric).toBe(false);
  });
  it('rejects temperatures when radiometric is false', () => {
    expect(() => thermalImageSchema.parse({ ...base, centerTemperature: 36.6 })).toThrow(/radiometric/);
  });
  it('accepts temperatures when radiometric is true', () => {
    expect(thermalImageSchema.parse({ ...base, radiometric: true, centerTemperature: 36.6 }).centerTemperature).toBe(36.6);
  });
});

describe('alertSchema', () => {
  it('fills defaults', () => {
    const a = alertSchema.parse({ id: 'a1', type: 'GAS_ALERT', severity: 'CRITICAL', timestamp: '2026-09-29T10:00:00Z', message: 'x', missionId: null, position: null, source: 'REAL' });
    expect(a.acknowledged).toBe(false);
    expect(a.metadata).toEqual({});
  });
});

describe('live frame framing', () => {
  it('round-trips header and payload', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const encoded = encodeLiveFrame({ channel: 'thermal', timestamp: 't', frameId: 'f', width: 256, height: 192, source: 'REAL' }, jpeg);
    const decoded = decodeLiveFrame(encoded);
    expect(decoded?.header.channel).toBe('thermal');
    expect(Array.from(decoded!.jpeg)).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  });
  it('returns null on truncated input', () => {
    expect(decodeLiveFrame(new Uint8Array([0, 0, 0, 9, 1]))).toBeNull();
  });
});
