import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { alertFromReading, esp32PayloadToReading } from './esp32.js';

describe('esp32PayloadToReading', () => {
  it('maps the raw ESP32 payload to a SensorReading', () => {
    const reading = esp32PayloadToReading(
      { temperature: 23.4, humidity: 51, gas_raw: 1900, gas_alert: false, extra: 'ignored' },
      { id: 'sensor_1', timestamp: '2026-09-29T10:00:00.000Z', missionId: 'mission_1' },
    );
    expect(reading).toEqual({
      id: 'sensor_1',
      timestamp: '2026-09-29T10:00:00.000Z',
      missionId: 'mission_1',
      source: 'REAL',
      temperatureC: 23.4,
      humidityPct: 51,
      gasRaw: 1900,
      gasAlert: false,
      position: null,
    });
  });

  it('generates an id and timestamp when not supplied', () => {
    const reading = esp32PayloadToReading({ temperature: 20, humidity: 40, gas_raw: 1500, gas_alert: true });
    expect(reading.id).toMatch(/^sensor_/);
    expect(new Date(reading.timestamp).toISOString()).toBe(reading.timestamp);
    expect(reading.gasAlert).toBe(true);
  });

  it('rejects wrong types', () => {
    expect(() => esp32PayloadToReading({ temperature: '23', humidity: 51, gas_raw: 1900, gas_alert: false })).toThrow(ZodError);
    expect(() => esp32PayloadToReading({ temperature: 23, humidity: 51, gas_raw: -1, gas_alert: false })).toThrow(ZodError);
  });
});

describe('alertFromReading', () => {
  const base = esp32PayloadToReading({ temperature: 30, humidity: 60, gas_raw: 2600, gas_alert: true }, { id: 'sensor_9', missionId: 'm' });

  it('produces a GAS_ALERT with sensor metadata when gasAlert is true', () => {
    const alert = alertFromReading(base);
    expect(alert).not.toBeNull();
    expect(alert!.type).toBe('GAS_ALERT');
    expect(alert!.severity).toBe('CRITICAL');
    expect(alert!.metadata).toEqual({ gasRaw: 2600, temperatureC: 30, humidityPct: 60 });
    expect(alert!.missionId).toBe('m');
    expect(alert!.source).toBe('REAL');
    expect(alert!.id).toBe('alert_sensor_9');
    expect(alert!.message.startsWith('[SIMULATION]')).toBe(false);
  });

  it('returns null when the board did not flag an alert', () => {
    expect(alertFromReading({ ...base, gasAlert: false })).toBeNull();
  });

  it('labels simulated readings', () => {
    const alert = alertFromReading({ ...base, source: 'SIMULATION' });
    expect(alert!.source).toBe('SIMULATION');
    expect(alert!.message.startsWith('[SIMULATION] ')).toBe(true);
  });
});
