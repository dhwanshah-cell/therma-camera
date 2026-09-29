import { randomUUID } from 'node:crypto';
import { alertSchema, esp32SensorPayloadSchema, type Alert, type DataSource, type Position, type SensorReading } from '@robodog/shared';

export interface Esp32ConversionOptions {
  /** Record id; defaults to `sensor_<uuid>`. */
  id?: string;
  /** ISO timestamp of the poll; defaults to now. */
  timestamp?: string;
  missionId?: string | null;
  position?: Position | null;
  /** Defaults to REAL because this helper converts data polled from the physical board. */
  source?: DataSource;
}

/**
 * Convert the raw ESP32 JSON (`GET http://192.168.4.1/api/sensors`) into a SensorReading.
 * The payload is validated with the shared strict schema; invalid payloads throw a ZodError.
 * gas_raw is the raw MQ-series ADC value and is stored as-is (it is NOT a ppm value).
 */
export function esp32PayloadToReading(payload: unknown, opts: Esp32ConversionOptions = {}): SensorReading {
  const parsed = esp32SensorPayloadSchema.parse(payload);
  return {
    id: opts.id ?? `sensor_${randomUUID()}`,
    timestamp: opts.timestamp ?? new Date().toISOString(),
    missionId: opts.missionId ?? null,
    source: opts.source ?? 'REAL',
    temperatureC: parsed.temperature,
    humidityPct: parsed.humidity,
    gasRaw: parsed.gas_raw,
    gasAlert: parsed.gas_alert,
    position: opts.position ?? null,
  };
}

/**
 * Derive a GAS_ALERT from a reading whose board flagged `gasAlert`. Returns null otherwise so
 * callers never emit alerts that the sensor did not raise.
 */
export function alertFromReading(reading: SensorReading): Alert | null {
  if (!reading.gasAlert) return null;
  const prefix = reading.source === 'SIMULATION' ? '[SIMULATION] ' : '';
  const gasRaw = reading.gasRaw === null ? 'n/a' : String(reading.gasRaw);
  return alertSchema.parse({
    id: `alert_${reading.id}`,
    type: 'GAS_ALERT',
    severity: 'CRITICAL',
    timestamp: reading.timestamp,
    message: `${prefix}Gas alert: MQ sensor raw value ${gasRaw}`,
    metadata: { gasRaw: reading.gasRaw, temperatureC: reading.temperatureC, humidityPct: reading.humidityPct },
    missionId: reading.missionId,
    position: reading.position,
    source: reading.source,
    thermalImageId: null,
    rgbImageId: null,
    acknowledged: false,
  });
}
