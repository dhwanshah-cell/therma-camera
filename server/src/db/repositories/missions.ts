import type { DataSource, Mission, MissionStats } from '@robodog/shared';
import type { Db } from '../database.js';
import { normalizeTimestamp, nowIso, type InsertResult } from './common.js';

interface MissionRow {
  id: string;
  number: number;
  name: string;
  start_time: string;
  end_time: string | null;
  status: Mission['status'];
  notes: string | null;
  source: DataSource;
}

export interface NewMission {
  id: string;
  name: string;
  startTime: string;
  notes: string | null;
  source: DataSource;
  status?: Mission['status'];
  endTime?: string | null;
}

export interface MissionUpdate {
  name?: string;
  endTime?: string | null;
  status?: Mission['status'];
  notes?: string | null;
}

export interface MissionListOptions {
  status?: Mission['status'];
  source?: DataSource;
  limit?: number;
}

export class MissionRepository {
  constructor(private readonly db: Db) {}

  /** Mission stats are never stored; they are counted from the other tables on every read. */
  stats(missionId: string): MissionStats {
    const count = (sql: string): number =>
      (this.db.prepare(sql).get(missionId) as { n: number }).n;
    return {
      thermalImages: count('SELECT COUNT(*) AS n FROM thermal_images WHERE mission_id = ?'),
      rgbImages: count('SELECT COUNT(*) AS n FROM rgb_images WHERE mission_id = ?'),
      videos: count('SELECT COUNT(*) AS n FROM videos WHERE mission_id = ?'),
      sensorReadings: count('SELECT COUNT(*) AS n FROM sensor_readings WHERE mission_id = ?'),
      gasAlerts: count("SELECT COUNT(*) AS n FROM alerts WHERE mission_id = ? AND type = 'GAS_ALERT'"),
      thermalHotspots: count(
        "SELECT COUNT(*) AS n FROM alerts WHERE mission_id = ? AND type IN ('THERMAL_HOTSPOT','THERMAL_INTENSITY_HOTSPOT')",
      ),
      maps: count('SELECT COUNT(*) AS n FROM thermal_maps WHERE mission_id = ?'),
    };
  }

  private toMission(row: MissionRow): Mission {
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      notes: row.notes,
      source: row.source,
      stats: this.stats(row.id),
    };
  }

  nextNumber(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM missions').get() as { n: number };
    return row.n;
  }

  get(id: string): Mission | null {
    const row = this.db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as MissionRow | undefined;
    return row ? this.toMission(row) : null;
  }

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM missions WHERE id = ?').get(id) !== undefined;
  }

  list(opts: MissionListOptions = {}): Mission[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      where.push('status = ?');
      params.push(opts.status);
    }
    if (opts.source) {
      where.push('source = ?');
      params.push(opts.source);
    }
    const sql = `SELECT * FROM missions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY number DESC LIMIT ?`;
    params.push(opts.limit ?? 500);
    const rows = this.db.prepare(sql).all(...params) as MissionRow[];
    return rows.map((r) => this.toMission(r));
  }

  activeMission(source?: DataSource): Mission | null {
    const row = (
      source
        ? this.db.prepare("SELECT * FROM missions WHERE status = 'ACTIVE' AND source = ? ORDER BY number DESC LIMIT 1").get(source)
        : this.db.prepare("SELECT * FROM missions WHERE status = 'ACTIVE' ORDER BY number DESC LIMIT 1").get()
    ) as MissionRow | undefined;
    return row ? this.toMission(row) : null;
  }

  /**
   * Create a mission with a server-assigned sequential number. When the new mission is ACTIVE,
   * any other ACTIVE mission with the same source is completed first (one active mission per source).
   * Returns 'duplicate' without changes when the id already exists.
   */
  create(input: NewMission): { result: InsertResult; mission: Mission } {
    const run = this.db.transaction((): { result: InsertResult; mission: Mission } => {
      const existing = this.get(input.id);
      if (existing) return { result: 'duplicate', mission: existing };
      const status = input.status ?? 'ACTIVE';
      const now = nowIso();
      if (status === 'ACTIVE') {
        this.db
          .prepare(
            "UPDATE missions SET status = 'COMPLETED', end_time = COALESCE(end_time, ?), updated_at = ? WHERE status = 'ACTIVE' AND source = ?",
          )
          .run(now, now, input.source);
      }
      this.db
        .prepare(
          `INSERT INTO missions (id, number, name, start_time, end_time, status, notes, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(input.id, this.nextNumber(), input.name, normalizeTimestamp(input.startTime), input.endTime ? normalizeTimestamp(input.endTime) : null, status, input.notes, input.source, now, now);
      const mission = this.get(input.id);
      if (!mission) throw new Error('mission insert failed');
      return { result: 'accepted', mission };
    });
    return run();
  }

  update(id: string, patch: MissionUpdate): Mission | null {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (patch.name !== undefined) {
      sets.push('name = ?');
      params.push(patch.name);
    }
    if (patch.endTime !== undefined) {
      sets.push('end_time = ?');
      params.push(patch.endTime === null ? null : normalizeTimestamp(patch.endTime));
    }
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
      // Leaving ACTIVE without an explicit end time stamps the end now.
      if (patch.status !== 'ACTIVE' && patch.endTime === undefined) {
        sets.push('end_time = COALESCE(end_time, ?)');
        params.push(nowIso());
      }
      if (patch.status === 'ACTIVE' && patch.endTime === undefined) {
        sets.push('end_time = NULL');
      }
    }
    if (patch.notes !== undefined) {
      sets.push('notes = ?');
      params.push(patch.notes);
    }
    if (sets.length === 0) return this.get(id);
    sets.push('updated_at = ?');
    params.push(nowIso());
    params.push(id);
    const run = this.db.transaction(() => {
      if (patch.status === 'ACTIVE') {
        const current = this.get(id);
        if (current) {
          this.db
            .prepare(
              "UPDATE missions SET status = 'COMPLETED', end_time = COALESCE(end_time, ?), updated_at = ? WHERE status = 'ACTIVE' AND source = ? AND id <> ?",
            )
            .run(nowIso(), nowIso(), current.source, id);
        }
      }
      this.db.prepare(`UPDATE missions SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    });
    run();
    return this.get(id);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM missions').get() as { n: number }).n;
  }
}
