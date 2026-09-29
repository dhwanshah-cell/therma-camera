import type { Alert, AlertSeverity, AlertType, DataSource } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, parseJson, positionFromColumns, positionToColumns, type InsertResult, type PositionColumns } from './common.js';

interface AlertRow extends PositionColumns {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: string;
  message: string;
  metadata: string;
  mission_id: string | null;
  source: DataSource;
  thermal_image_id: string | null;
  rgb_image_id: string | null;
  acknowledged: number;
}

export interface AlertQuery {
  missionId?: string;
  type?: AlertType;
  severity?: AlertSeverity;
  acknowledged?: boolean;
  limit?: number;
}

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    type: r.type,
    severity: r.severity,
    timestamp: r.timestamp,
    message: r.message,
    metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
    missionId: r.mission_id,
    position: positionFromColumns(r),
    source: r.source,
    thermalImageId: r.thermal_image_id,
    rgbImageId: r.rgb_image_id,
    acknowledged: r.acknowledged !== 0,
  };
}

export class AlertRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO alerts
        (id, type, severity, timestamp, message, metadata, mission_id,
         x, y, z, position_frame, position_confidence,
         source, thermal_image_id, rgb_image_id, acknowledged, received_at)
       VALUES (@id, @type, @severity, @timestamp, @message, @metadata, @mission_id,
         @x, @y, @z, @position_frame, @position_confidence,
         @source, @thermal_image_id, @rgb_image_id, @acknowledged, @received_at)`,
    );
  }

  insert(alert: Alert): InsertResult {
    const info = this.insertStmt.run({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      timestamp: normalizeTimestamp(alert.timestamp),
      message: alert.message,
      metadata: JSON.stringify(alert.metadata ?? {}),
      mission_id: alert.missionId,
      ...positionToColumns(alert.position),
      source: alert.source,
      thermal_image_id: alert.thermalImageId,
      rgb_image_id: alert.rgbImageId,
      acknowledged: alert.acknowledged ? 1 : 0,
      received_at: nowIso(),
    });
    return info.changes > 0 ? 'accepted' : 'duplicate';
  }

  get(id: string): Alert | null {
    const row = this.db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined;
    return row ? toAlert(row) : null;
  }

  list(q: AlertQuery = {}): Alert[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.missionId) {
      where.push('mission_id = ?');
      params.push(q.missionId);
    }
    if (q.type) {
      where.push('type = ?');
      params.push(q.type);
    }
    if (q.severity) {
      where.push('severity = ?');
      params.push(q.severity);
    }
    if (q.acknowledged !== undefined) {
      where.push('acknowledged = ?');
      params.push(q.acknowledged ? 1 : 0);
    }
    params.push(q.limit ?? 100);
    const rows = this.db
      .prepare(`SELECT * FROM alerts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
      .all(...params) as AlertRow[];
    return rows.map(toAlert);
  }

  acknowledge(id: string): Alert | null {
    this.db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(id);
    return this.get(id);
  }

  count(opts: { acknowledged?: boolean } = {}): number {
    if (opts.acknowledged === undefined) {
      return (this.db.prepare('SELECT COUNT(*) AS n FROM alerts').get() as { n: number }).n;
    }
    return (this.db.prepare('SELECT COUNT(*) AS n FROM alerts WHERE acknowledged = ?').get(opts.acknowledged ? 1 : 0) as { n: number }).n;
  }
}
