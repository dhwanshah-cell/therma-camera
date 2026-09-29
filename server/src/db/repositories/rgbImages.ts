import type { DataSource, Position, RgbImage } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, type InsertResult } from './common.js';
import { mediaWhere, type FileAttachment, type MediaQuery } from './thermalImages.js';

interface RgbImageRow {
  id: string;
  timestamp: string;
  mission_id: string | null;
  camera_id: string;
  width: number;
  height: number;
  file_name: string;
  file_path: string;
  associated_thermal_image_id: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  position_frame: Position['frame'] | null;
  source: DataSource;
  size_bytes: number | null;
  uploaded: number;
}

function toImage(r: RgbImageRow): RgbImage {
  return {
    id: r.id,
    timestamp: r.timestamp,
    missionId: r.mission_id,
    cameraId: r.camera_id,
    width: r.width,
    height: r.height,
    fileName: r.file_name,
    filePath: r.file_path,
    associatedThermalImageId: r.associated_thermal_image_id,
    x: r.x,
    y: r.y,
    z: r.z,
    positionFrame: r.position_frame,
    source: r.source,
    sizeBytes: r.size_bytes,
    uploaded: r.uploaded !== 0,
  };
}

export class RgbImageRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO rgb_images
        (id, timestamp, mission_id, camera_id, width, height, file_name, file_path, associated_thermal_image_id,
         x, y, z, position_frame, source, size_bytes, uploaded, received_at)
       VALUES (@id, @timestamp, @mission_id, @camera_id, @width, @height, @file_name, @file_path, @associated_thermal_image_id,
         @x, @y, @z, @position_frame, @source, @size_bytes, @uploaded, @received_at)`,
    );
  }

  insert(img: RgbImage): InsertResult {
    const info = this.insertStmt.run({
      id: img.id,
      timestamp: normalizeTimestamp(img.timestamp),
      mission_id: img.missionId,
      camera_id: img.cameraId,
      width: img.width,
      height: img.height,
      file_name: img.fileName,
      file_path: img.filePath,
      associated_thermal_image_id: img.associatedThermalImageId,
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

  get(id: string): RgbImage | null {
    const row = this.db.prepare('SELECT * FROM rgb_images WHERE id = ?').get(id) as RgbImageRow | undefined;
    return row ? toImage(row) : null;
  }

  list(q: MediaQuery = {}): RgbImage[] {
    const { clause, params } = mediaWhere(q);
    const rows = this.db
      .prepare(`SELECT * FROM rgb_images ${clause} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
      .all(...params, q.limit ?? 100) as RgbImageRow[];
    return rows.map(toImage);
  }

  attachFile(id: string, file: FileAttachment): RgbImage | null {
    this.db
      .prepare('UPDATE rgb_images SET file_path = ?, file_name = ?, size_bytes = ?, uploaded = 1 WHERE id = ?')
      .run(file.filePath, file.fileName, file.sizeBytes, id);
    return this.get(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM rgb_images WHERE id = ?').run(id).changes > 0;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM rgb_images').get() as { n: number }).n;
  }
}
