import type { WsRole } from '@robodog/shared';
import type { Db } from '../database.js';
import { nowIso } from './common.js';

export interface Device {
  id: string;
  role: WsRole | 'sync';
  version: string | null;
  firstSeen: string;
  lastSeen: string;
}

interface DeviceRow {
  id: string;
  role: Device['role'];
  version: string | null;
  first_seen: string;
  last_seen: string;
}

/** Devices (phones, web clients, robots) seen over WebSocket or the sync endpoint. */
export class DeviceRepository {
  constructor(private readonly db: Db) {}

  touch(id: string, role: Device['role'], version: string | null = null): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO devices (id, role, version, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET role = excluded.role, version = COALESCE(excluded.version, devices.version), last_seen = excluded.last_seen`,
      )
      .run(id, role, version, now, now);
  }

  list(): Device[] {
    const rows = this.db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all() as DeviceRow[];
    return rows.map((r) => ({ id: r.id, role: r.role, version: r.version, firstSeen: r.first_seen, lastSeen: r.last_seen }));
  }
}
