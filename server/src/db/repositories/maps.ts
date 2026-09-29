import type { DataSource, Position, ThermalMap } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, parseJson, type InsertResult } from './common.js';
import { mediaWhere, type MediaQuery } from './thermalImages.js';

interface MapRow {
  id: string;
  mission_id: string | null;
  timestamp: string;
  name: string;
  dimension: ThermalMap['dimension'];
  pose_source: Position['frame'] | null;
  has_depth: number;
  has_temperature: number;
  point_count: number;
  file_path: string | null;
  bounds: string | null;
  source: DataSource;
}

function toMap(r: MapRow): ThermalMap {
  return {
    id: r.id,
    missionId: r.mission_id,
    timestamp: r.timestamp,
    name: r.name,
    dimension: r.dimension,
    poseSource: r.pose_source,
    hasDepth: r.has_depth !== 0,
    hasTemperature: r.has_temperature !== 0,
    pointCount: r.point_count,
    filePath: r.file_path,
    bounds: parseJson<ThermalMap['bounds']>(r.bounds, null),
    source: r.source,
  };
}

/**
 * Map metadata only. Points and trajectory live in a JSON file under media/maps/<id>.json
 * (see MediaStore); the row stores just bounds and pointCount.
 */
export class ThermalMapRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO thermal_maps
        (id, mission_id, timestamp, name, dimension, pose_source, has_depth, has_temperature, point_count, file_path, bounds, source, received_at)
       VALUES (@id, @mission_id, @timestamp, @name, @dimension, @pose_source, @has_depth, @has_temperature, @point_count, @file_path, @bounds, @source, @received_at)`,
    );
  }

  insert(m: ThermalMap): InsertResult {
    const info = this.insertStmt.run({
      id: m.id,
      mission_id: m.missionId,
      timestamp: normalizeTimestamp(m.timestamp),
      name: m.name,
      dimension: m.dimension,
      pose_source: m.poseSource,
      has_depth: m.hasDepth ? 1 : 0,
      has_temperature: m.hasTemperature ? 1 : 0,
      point_count: m.pointCount,
      file_path: m.filePath,
      bounds: m.bounds ? JSON.stringify(m.bounds) : null,
      source: m.source,
      received_at: nowIso(),
    });
    return info.changes > 0 ? 'accepted' : 'duplicate';
  }

  get(id: string): ThermalMap | null {
    const row = this.db.prepare('SELECT * FROM thermal_maps WHERE id = ?').get(id) as MapRow | undefined;
    return row ? toMap(row) : null;
  }

  list(q: MediaQuery = {}): ThermalMap[] {
    const { clause, params } = mediaWhere(q);
    const rows = this.db
      .prepare(`SELECT * FROM thermal_maps ${clause} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
      .all(...params, q.limit ?? 100) as MapRow[];
    return rows.map(toMap);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM thermal_maps WHERE id = ?').run(id).changes > 0;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM thermal_maps').get() as { n: number }).n;
  }
}
