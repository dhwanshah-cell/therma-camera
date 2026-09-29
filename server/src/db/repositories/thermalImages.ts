import type { DataSource, Position, ThermalImage, ThermalPalette } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, type InsertResult } from './common.js';

interface ThermalImageRow {
  id: string;
  timestamp: string;
  mission_id: string | null;
  camera_model: string;
  width: number;
  height: number;
  file_name: string;
  file_path: string;
  palette: ThermalPalette;
  frame_format: string | null;
  radiometric: number;
  center_temperature: number | null;
  min_temperature: number | null;
  max_temperature: number | null;
  emissivity: number | null;
  distance: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  position_frame: Position['frame'] | null;
  source: DataSource;
  size_bytes: number | null;
  uploaded: number;
}

/** Common time-range query for media tables. */
export interface MediaQuery {
  missionId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export function mediaWhere(q: MediaQuery): { clause: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.missionId) {
    where.push('mission_id = ?');
    params.push(q.missionId);
  }
  if (q.from) {
    where.push('timestamp >= ?');
    params.push(normalizeTimestamp(q.from));
  }
  if (q.to) {
    where.push('timestamp <= ?');
    params.push(normalizeTimestamp(q.to));
  }
  return { clause: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function toImage(r: ThermalImageRow): ThermalImage {
  return {
    id: r.id,
    timestamp: r.timestamp,
    missionId: r.mission_id,
    cameraModel: r.camera_model,
    width: r.width,
    height: r.height,
    fileName: r.file_name,
    filePath: r.file_path,
    palette: r.palette,
    frameFormat: r.frame_format,
    radiometric: r.radiometric !== 0,
    centerTemperature: r.center_temperature,
    minTemperature: r.min_temperature,
    maxTemperature: r.max_temperature,
    emissivity: r.emissivity,
    distance: r.distance,
    x: r.x,
    y: r.y,
    z: r.z,
    positionFrame: r.position_frame,
    source: r.source,
    sizeBytes: r.size_bytes,
    uploaded: r.uploaded !== 0,
  };
}

export interface FileAttachment {
  filePath: string;
  fileName: string;
  sizeBytes: number;
}

export class ThermalImageRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO thermal_images
        (id, timestamp, mission_id, camera_model, width, height, file_name, file_path, palette, frame_format,
         radiometric, center_temperature, min_temperature, max_temperature, emissivity, distance,
         x, y, z, position_frame, source, size_bytes, uploaded, received_at)
       VALUES (@id, @timestamp, @mission_id, @camera_model, @width, @height, @file_name, @file_path, @palette, @frame_format,
         @radiometric, @center_temperature, @min_temperature, @max_temperature, @emissivity, @distance,
         @x, @y, @z, @position_frame, @source, @size_bytes, @uploaded, @received_at)`,
    );
  }

  insert(img: ThermalImage): InsertResult {
    const info = this.insertStmt.run({
      id: img.id,
      timestamp: normalizeTimestamp(img.timestamp),
      mission_id: img.missionId,
      camera_model: img.cameraModel,
      width: img.width,
      height: img.height,
      file_name: img.fileName,
      file_path: img.filePath,
      palette: img.palette,
      frame_format: img.frameFormat,
      radiometric: img.radiometric ? 1 : 0,
      center_temperature: img.centerTemperature,
      min_temperature: img.minTemperature,
      max_temperature: img.maxTemperature,
      emissivity: img.emissivity,
      distance: img.distance,
      x: img.x,
      y: img.y,
      z: img.z,
      position_frame: img.positionFrame,
      source: img.source,
      size_bytes: img.sizeBytes,
      uploaded: img.uploaded ? 1 : 0,
      received_at: nowIso(),
    });
    return info.changes > 0 ? 'accepted' : 'duplicate';
  }

  get(id: string): ThermalImage | null {
    const row = this.db.prepare('SELECT * FROM thermal_images WHERE id = ?').get(id) as ThermalImageRow | undefined;
    return row ? toImage(row) : null;
  }

  list(q: MediaQuery = {}): ThermalImage[] {
    const { clause, params } = mediaWhere(q);
    const rows = this.db
      .prepare(`SELECT * FROM thermal_images ${clause} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
      .all(...params, q.limit ?? 100) as ThermalImageRow[];
    return rows.map(toImage);
  }

  /** Record that the binary has been stored on the server. */
  attachFile(id: string, file: FileAttachment): ThermalImage | null {
    this.db
      .prepare('UPDATE thermal_images SET file_path = ?, file_name = ?, size_bytes = ?, uploaded = 1 WHERE id = ?')
      .run(file.filePath, file.fileName, file.sizeBytes, id);
    return this.get(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM thermal_images WHERE id = ?').run(id).changes > 0;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM thermal_images').get() as { n: number }).n;
  }
}
