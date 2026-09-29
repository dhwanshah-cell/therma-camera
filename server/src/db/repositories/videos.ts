import type { DataSource, ThermalPalette, VideoRecording } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, type InsertResult } from './common.js';
import { mediaWhere, type FileAttachment, type MediaQuery } from './thermalImages.js';

interface VideoRow {
  id: string;
  kind: VideoRecording['kind'];
  timestamp: string;
  end_timestamp: string | null;
  mission_id: string | null;
  camera_model: string;
  width: number;
  height: number;
  file_name: string;
  file_path: string;
  duration_ms: number | null;
  frame_count: number | null;
  codec: string;
  palette: ThermalPalette | null;
  source: DataSource;
  size_bytes: number | null;
  uploaded: number;
}

function toVideo(r: VideoRow): VideoRecording {
  return {
    id: r.id,
    kind: r.kind,
    timestamp: r.timestamp,
    endTimestamp: r.end_timestamp,
    missionId: r.mission_id,
    cameraModel: r.camera_model,
    width: r.width,
    height: r.height,
    fileName: r.file_name,
    filePath: r.file_path,
    durationMs: r.duration_ms,
    frameCount: r.frame_count,
    codec: r.codec,
    palette: r.palette,
    source: r.source,
    sizeBytes: r.size_bytes,
    uploaded: r.uploaded !== 0,
  };
}

export interface VideoQuery extends MediaQuery {
  kind?: VideoRecording['kind'];
}

export class VideoRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT OR IGNORE INTO videos
        (id, kind, timestamp, end_timestamp, mission_id, camera_model, width, height, file_name, file_path,
         duration_ms, frame_count, codec, palette, source, size_bytes, uploaded, received_at)
       VALUES (@id, @kind, @timestamp, @end_timestamp, @mission_id, @camera_model, @width, @height, @file_name, @file_path,
         @duration_ms, @frame_count, @codec, @palette, @source, @size_bytes, @uploaded, @received_at)`,
    );
  }

  insert(v: VideoRecording): InsertResult {
    const info = this.insertStmt.run({
      id: v.id,
      kind: v.kind,
      timestamp: normalizeTimestamp(v.timestamp),
      end_timestamp: v.endTimestamp === null ? null : normalizeTimestamp(v.endTimestamp),
      mission_id: v.missionId,
      camera_model: v.cameraModel,
      width: v.width,
      height: v.height,
      file_name: v.fileName,
      file_path: v.filePath,
      duration_ms: v.durationMs,
      frame_count: v.frameCount,
      codec: v.codec,
      palette: v.palette,
      source: v.source,
      size_bytes: v.sizeBytes,
      uploaded: v.uploaded ? 1 : 0,
      received_at: nowIso(),
    });
    return info.changes > 0 ? 'accepted' : 'duplicate';
  }

  get(id: string): VideoRecording | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as VideoRow | undefined;
    return row ? toVideo(row) : null;
  }

  list(q: VideoQuery = {}): VideoRecording[] {
    const { clause, params } = mediaWhere(q);
    let where = clause;
    if (q.kind) {
      where = where ? `${where} AND kind = ?` : 'WHERE kind = ?';
      params.push(q.kind);
    }
    const rows = this.db
      .prepare(`SELECT * FROM videos ${where} ORDER BY timestamp DESC, rowid DESC LIMIT ?`)
      .all(...params, q.limit ?? 100) as VideoRow[];
    return rows.map(toVideo);
  }

  attachFile(id: string, file: FileAttachment): VideoRecording | null {
    this.db
      .prepare('UPDATE videos SET file_path = ?, file_name = ?, size_bytes = ?, uploaded = 1 WHERE id = ?')
      .run(file.filePath, file.fileName, file.sizeBytes, id);
    return this.get(id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM videos WHERE id = ?').run(id).changes > 0;
  }

  count(kind?: VideoRecording['kind']): number {
    if (kind) return (this.db.prepare('SELECT COUNT(*) AS n FROM videos WHERE kind = ?').get(kind) as { n: number }).n;
    return (this.db.prepare('SELECT COUNT(*) AS n FROM videos').get() as { n: number }).n;
  }
}
