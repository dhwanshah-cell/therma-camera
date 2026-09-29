import type { SyncEnvelope } from '@robodog/shared';
import type { Db } from '../database.js';
import { nowIso } from './common.js';

/** Records every sync envelope id that was accepted so re-sent batches are recognised as duplicates. */
export class SyncLogRepository {
  private readonly insertStmt;
  private readonly existsStmt;

  constructor(private readonly db: Db) {
    this.insertStmt = db.prepare('INSERT OR IGNORE INTO sync_log (id, kind, device_id, received_at) VALUES (?, ?, ?, ?)');
    this.existsStmt = db.prepare('SELECT 1 FROM sync_log WHERE id = ?');
  }

  has(id: string): boolean {
    return this.existsStmt.get(id) !== undefined;
  }

  record(id: string, kind: SyncEnvelope['kind'], deviceId: string | null): boolean {
    return this.insertStmt.run(id, kind, deviceId, nowIso()).changes > 0;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM sync_log').get() as { n: number }).n;
  }
}
