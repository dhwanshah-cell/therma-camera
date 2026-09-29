import type Database from 'better-sqlite3';

/**
 * Versioned schema migrations. Append new entries; never edit an applied one.
 * Every migration runs inside a transaction and is recorded in schema_migrations.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const POSITION_COLUMNS = `
  x REAL,
  y REAL,
  z REAL,
  position_frame TEXT,
  position_confidence REAL`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        version TEXT,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        number INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','COMPLETED','ABORTED')),
        notes TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status, source);

      CREATE TABLE IF NOT EXISTS sensor_readings (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        mission_id TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        temperature_c REAL,
        humidity_pct REAL,
        gas_raw REAL,
        gas_alert INTEGER NOT NULL DEFAULT 0,
        ${POSITION_COLUMNS},
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_ts ON sensor_readings(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sensor_readings_mission ON sensor_readings(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        mission_id TEXT,
        ${POSITION_COLUMNS},
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        thermal_image_id TEXT,
        rgb_image_id TEXT,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(timestamp);
      CREATE INDEX IF NOT EXISTS idx_alerts_mission ON alerts(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS thermal_images (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        mission_id TEXT,
        camera_model TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        palette TEXT NOT NULL,
        frame_format TEXT,
        radiometric INTEGER NOT NULL DEFAULT 0,
        center_temperature REAL,
        min_temperature REAL,
        max_temperature REAL,
        emissivity REAL,
        distance REAL,
        x REAL,
        y REAL,
        z REAL,
        position_frame TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        size_bytes INTEGER,
        uploaded INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_thermal_images_ts ON thermal_images(timestamp);
      CREATE INDEX IF NOT EXISTS idx_thermal_images_mission ON thermal_images(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS rgb_images (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        mission_id TEXT,
        camera_id TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        associated_thermal_image_id TEXT,
        x REAL,
        y REAL,
        z REAL,
        position_frame TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        size_bytes INTEGER,
        uploaded INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rgb_images_ts ON rgb_images(timestamp);
      CREATE INDEX IF NOT EXISTS idx_rgb_images_mission ON rgb_images(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('THERMAL','RGB')),
        timestamp TEXT NOT NULL,
        end_timestamp TEXT,
        mission_id TEXT,
        camera_model TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        duration_ms REAL,
        frame_count INTEGER,
        codec TEXT NOT NULL,
        palette TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        size_bytes INTEGER,
        uploaded INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_videos_ts ON videos(timestamp);
      CREATE INDEX IF NOT EXISTS idx_videos_mission ON videos(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS thermal_maps (
        id TEXT PRIMARY KEY,
        mission_id TEXT,
        timestamp TEXT NOT NULL,
        name TEXT NOT NULL,
        dimension TEXT NOT NULL CHECK (dimension IN ('2D','3D')),
        pose_source TEXT,
        has_depth INTEGER NOT NULL DEFAULT 0,
        has_temperature INTEGER NOT NULL DEFAULT 0,
        point_count INTEGER NOT NULL DEFAULT 0,
        file_path TEXT,
        bounds TEXT,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_thermal_maps_mission ON thermal_maps(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS imu_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        monotonic_ns INTEGER NOT NULL,
        mission_id TEXT,
        ax REAL NOT NULL, ay REAL NOT NULL, az REAL NOT NULL,
        gx REAL NOT NULL, gy REAL NOT NULL, gz REAL NOT NULL,
        mx REAL, my REAL, mz REAL,
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_imu_samples_mission ON imu_samples(mission_id, timestamp);

      CREATE TABLE IF NOT EXISTS robot_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION')),
        phone_connected INTEGER NOT NULL,
        esp32_connected INTEGER NOT NULL,
        thermal_camera_connected INTEGER NOT NULL,
        robot_connected INTEGER NOT NULL,
        battery_pct REAL,
        motor_state TEXT,
        leg_state TEXT,
        imu_available INTEGER NOT NULL,
        moving INTEGER,
        slam_status TEXT,
        gps TEXT,
        lidar_available INTEGER NOT NULL,
        active_mission_id TEXT,
        extra TEXT NOT NULL DEFAULT '{}',
        received_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_robot_status_ts ON robot_status(timestamp);

      CREATE TABLE IF NOT EXISTS robot_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL CHECK (source IN ('REAL','SIMULATION'))
      );

      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        device_id TEXT,
        received_at TEXT NOT NULL
      );
    `,
  },
];

/** Apply every migration whose version is greater than the stored schema version. */
export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as {
    version: number;
  };
  const current = row.version;
  const insert = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)');
  const sorted = [...MIGRATIONS].sort((a, b) => a.version - b.version);
  for (const migration of sorted) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.version, migration.name, new Date().toISOString());
    })();
  }
}
