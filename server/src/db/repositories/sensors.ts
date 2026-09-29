import type { DataSource, SensorReading } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, positionFromColumns, positionToColumns, type InsertResult, type PositionColumns } from './common.js';

interface SensorRow extends PositionColumns {
  id: string;
  timestamp: string;
  mission_id: string | null;
  source: DataSource;
  temperature_c: number | null;
  humidity_pct: number | null;
  gas_raw: number | null;
  gas_alert: number;
}

export interface SensorQuery {
  limit?: number;
  missionId?: string;
  /** ISO timestamp; only readings with timestamp >= since are returned. */
  since?: string;
  source?: DataSource;
}

function toReading(r: SensorRow): SensorReading {
  return {
    id: r.id,
    timestamp: r.timestamp,
    missionId: r.mission_id,
    source: r.source,
    temperatureC: r.temperature_c,
    humidityPct: r.humidity_pct,
    gasRaw: r.gas_raw,
    gasAlert: r.gas_alert !== 0,
    position: positionFromColumns(r),
  };
}

export class SensorRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO sensor_readings
        (id, timestamp, mission_id, source, temperature_c, humidity_pct, gas_raw, gas_alert,
         x, y, z, position_frame, position_confidence, received_at)
       VALUES (@id, @timestamp, @mission_id, @source, @temperature_c, @humidity_pct, @gas_raw, @gas_alert,
         @x, @y, @z, @position_frame, @position_confidence, @received_at)`,
    );
  }

  /** Idempotent insert keyed by the client-generated id. */
  insert(reading: SensorReading): InsertResult {
    const info = this.insertStmt.run({
      id: reading.id,
      timestamp: normalizeTimestamp(reading.timestamp),
      mission_id: reading.missionId,
      source: reading.source,
      temperature_c: reading.temperatureC,
      humidity_pct: reading.humidityPct,
      gas_raw: reading.gasRaw,
      gas_alert: reading.gasAlert ? 1 : 0,
      ...positionToColumns(reading.position),
      received_at: nowIso(),
    });
    return info.changes > 0 ? 'accepted' : 'duplicate';
  }

  get(id: string): SensorReading | null {
    const row = this.db.prepare('SELECT * FROM sensor_readings WHERE id = ?').get(id) as SensorRow | undefined;
    return row ? toReading(row) : null;
  }

  /** Newest first. */
  list(q: SensorQuery = {}): SensorReading[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.missionId) {
      where.push('mission_id = ?');
      params.push(q.missionId);
    }
    if (q.since) {
      where.push('timestamp >= ?');
      params.push(normalizeTimestamp(q.since));
    }
    if (q.source) {
      where.push('source = ?');
      params.push(q.source);
    }
    params.push(q.limit ?? 100);
    const rows = this.db
      .prepare(
        `SELECT * FROM sensor_readings ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp DESC, rowid DESC LIMIT ?`,
      )
      .all(...params) as SensorRow[];
    return rows.map(toReading);
  }

  latest(missionId?: string): SensorReading | null {
    return this.list({ limit: 1, ...(missionId ? { missionId } : {}) })[0] ?? null;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM sensor_readings').get() as { n: number }).n;
  }
}
