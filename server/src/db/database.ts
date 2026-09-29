import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export type Db = Database.Database;

/**
 * Open (or create) the SQLite database, enable WAL mode and apply pending migrations.
 * Pass ':memory:' for a hermetic in-memory database (tests).
 */
export function openDatabase(dbPath: string): Db {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  // WAL gives concurrent readers while the phone syncs; in-memory databases report 'memory' which is fine.
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}
