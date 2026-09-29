import type { ImuSample } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso } from './common.js';

interface ImuRow {
  timestamp: string;
  monotonic_ns: number;
  mission_id: string | null;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  mx: number | null;
  my: number | null;
  mz: number | null;
}

export class ImuRepository {
  private readonly insertStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare(
      `INSERT INTO imu_samples (timestamp, monotonic_ns, mission_id, ax, ay, az, gx, gy, gz, mx, my, mz, received_at)
       VALUES (@timestamp, @monotonic_ns, @mission_id, @ax, @ay, @az, @gx, @gy, @gz, @mx, @my, @mz, @received_at)`,
    );
  }

  /** Bulk insert in one transaction. IMU samples have no client id, so they are not deduplicated. */
  insertMany(samples: ImuSample[]): number {
    const receivedAt = nowIso();
    const run = this.db.transaction((rows: ImuSample[]) => {
      for (const s of rows) {
        this.insertStmt.run({
          timestamp: normalizeTimestamp(s.timestamp),
          monotonic_ns: s.monotonicNs,
          mission_id: s.missionId,
          ax: s.ax,
          ay: s.ay,
          az: s.az,
          gx: s.gx,
          gy: s.gy,
          gz: s.gz,
          mx: s.mx,
          my: s.my,
          mz: s.mz,
          received_at: receivedAt,
        });
      }
      return rows.length;
    });
    return run(samples);
  }

  list(opts: { missionId?: string; limit?: number } = {}): ImuSample[] {
    const params: unknown[] = [];
    let where = '';
    if (opts.missionId) {
      where = 'WHERE mission_id = ?';
      params.push(opts.missionId);
    }
    params.push(opts.limit ?? 1000);
    const rows = this.db.prepare(`SELECT * FROM imu_samples ${where} ORDER BY id DESC LIMIT ?`).all(...params) as ImuRow[];
    return rows.map((r) => ({
      timestamp: r.timestamp,
      monotonicNs: r.monotonic_ns,
      missionId: r.mission_id,
      ax: r.ax,
      ay: r.ay,
      az: r.az,
      gx: r.gx,
      gy: r.gy,
      gz: r.gz,
      mx: r.mx,
      my: r.my,
      mz: r.mz,
    }));
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM imu_samples').get() as { n: number }).n;
  }
}
