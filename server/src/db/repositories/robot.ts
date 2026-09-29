import type { DataSource, RobotStatus } from '@robodog/shared';
import type { Db } from '../database.js';
import { bool, fromBool, normalizeTimestamp, nowIso, parseJson } from './common.js';

interface RobotStatusRow {
  id: number;
  timestamp: string;
  source: DataSource;
  phone_connected: number;
  esp32_connected: number;
  thermal_camera_connected: number;
  robot_connected: number;
  battery_pct: number | null;
  motor_state: string | null;
  leg_state: string | null;
  imu_available: number;
  moving: number | null;
  slam_status: string | null;
  gps: string | null;
  lidar_available: number;
  active_mission_id: string | null;
  extra: string;
}

interface RobotEventRow {
  id: number;
  timestamp: string;
  kind: string;
  message: string;
  metadata: string;
  source: DataSource;
}

export interface RobotEvent {
  id: number;
  timestamp: string;
  kind: string;
  message: string;
  metadata: Record<string, unknown>;
  source: DataSource;
}

function toStatus(r: RobotStatusRow): RobotStatus {
  return {
    timestamp: r.timestamp,
    source: r.source,
    phoneConnected: r.phone_connected !== 0,
    esp32Connected: r.esp32_connected !== 0,
    thermalCameraConnected: r.thermal_camera_connected !== 0,
    robotConnected: r.robot_connected !== 0,
    batteryPct: r.battery_pct,
    motorState: r.motor_state,
    legState: r.leg_state,
    imuAvailable: r.imu_available !== 0,
    moving: fromBool(r.moving),
    slamStatus: r.slam_status,
    gps: parseJson<RobotStatus['gps']>(r.gps, null),
    lidarAvailable: r.lidar_available !== 0,
    activeMissionId: r.active_mission_id,
    extra: parseJson<Record<string, unknown>>(r.extra, {}),
  };
}

/** Robot status history (every report is appended; the latest row is the current status) plus the event log. */
export class RobotRepository {
  private readonly insertStatus;
  private readonly insertEvent;

  constructor(private readonly db: Db) {
    this.insertStatus = db.prepare(
      `INSERT INTO robot_status
        (timestamp, source, phone_connected, esp32_connected, thermal_camera_connected, robot_connected, battery_pct,
         motor_state, leg_state, imu_available, moving, slam_status, gps, lidar_available, active_mission_id, extra, received_at)
       VALUES (@timestamp, @source, @phone_connected, @esp32_connected, @thermal_camera_connected, @robot_connected, @battery_pct,
         @motor_state, @leg_state, @imu_available, @moving, @slam_status, @gps, @lidar_available, @active_mission_id, @extra, @received_at)`,
    );
    this.insertEvent = db.prepare(
      'INSERT INTO robot_events (timestamp, kind, message, metadata, source) VALUES (?, ?, ?, ?, ?)',
    );
  }

  recordStatus(s: RobotStatus): void {
    this.insertStatus.run({
      timestamp: normalizeTimestamp(s.timestamp),
      source: s.source,
      phone_connected: bool(s.phoneConnected),
      esp32_connected: bool(s.esp32Connected),
      thermal_camera_connected: bool(s.thermalCameraConnected),
      robot_connected: bool(s.robotConnected),
      battery_pct: s.batteryPct,
      motor_state: s.motorState,
      leg_state: s.legState,
      imu_available: bool(s.imuAvailable),
      moving: bool(s.moving),
      slam_status: s.slamStatus,
      gps: s.gps ? JSON.stringify(s.gps) : null,
      lidar_available: bool(s.lidarAvailable),
      active_mission_id: s.activeMissionId,
      extra: JSON.stringify(s.extra ?? {}),
      received_at: nowIso(),
    });
  }

  latest(): RobotStatus | null {
    const row = this.db.prepare('SELECT * FROM robot_status ORDER BY id DESC LIMIT 1').get() as RobotStatusRow | undefined;
    return row ? toStatus(row) : null;
  }

  history(limit = 100): RobotStatus[] {
    const rows = this.db.prepare('SELECT * FROM robot_status ORDER BY id DESC LIMIT ?').all(limit) as RobotStatusRow[];
    return rows.map(toStatus);
  }

  addEvent(kind: string, message: string, metadata: Record<string, unknown> = {}, source: DataSource = 'REAL'): void {
    this.insertEvent.run(nowIso(), kind, message, JSON.stringify(metadata), source);
  }

  events(limit = 100): RobotEvent[] {
    const rows = this.db.prepare('SELECT * FROM robot_events ORDER BY id DESC LIMIT ?').all(limit) as RobotEventRow[];
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      kind: r.kind,
      message: r.message,
      metadata: parseJson<Record<string, unknown>>(r.metadata, {}),
      source: r.source,
    }));
  }
}
