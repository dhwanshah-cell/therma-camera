import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import {
  alertSchema,
  createMissionSchema,
  imuSampleSchema,
  missionSchema,
  rgbImageSchema,
  robotStatusSchema,
  sensorReadingSchema,
  thermalImageSchema,
  thermalMapUploadSchema,
  updateMissionSchema,
  videoRecordingSchema,
  type Alert,
  type ImuSample,
  type Mission,
  type RgbImage,
  type RobotStatus,
  type SensorReading,
  type ThermalImage,
  type ThermalMap,
  type VideoRecording,
  type WsServerMessage,
} from '@robodog/shared';
import { z } from 'zod';
import type { InsertResult, Repositories } from '../db/repositories/index.js';
import type { MediaStore } from '../media/store.js';

/** Anything able to push server messages to web clients (the WebSocket hub). */
export interface Broadcaster {
  broadcastToWeb(message: WsServerMessage): void;
}

export type CreateMissionInput = z.input<typeof createMissionSchema>;
export type ThermalMapUpload = z.infer<typeof thermalMapUploadSchema>;

/** Points + trajectory as written to media/maps/<id>.json. */
export interface ThermalMapFile {
  id: string;
  points: ThermalMapUpload['points'];
  trajectory: ThermalMapUpload['trajectory'];
}

export const imuBatchSchema = z.object({ samples: z.array(imuSampleSchema).max(5000) });

/**
 * Single write path for every record type. REST routes, the WebSocket hub, the sync endpoint and
 * the simulator all go through here so persistence, deduplication and broadcasting behave the same.
 * Inserts are idempotent by id: an existing id is reported as 'duplicate' and nothing is re-broadcast.
 */
export class Ingest {
  constructor(
    private readonly repos: Repositories,
    private readonly store: MediaStore,
    private readonly broadcaster: Broadcaster,
    private readonly log: FastifyBaseLogger,
  ) {}

  sensor(reading: SensorReading): InsertResult {
    const result = this.repos.sensors.insert(reading);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'sensor', reading });
    return result;
  }

  alert(alert: Alert): InsertResult {
    const result = this.repos.alerts.insert(alert);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'alert', alert });
    return result;
  }

  /**
   * Create a mission from the POST /api/missions body. The server assigns the number; the id defaults
   * to `mission_<uuid>`. Creating an ACTIVE mission completes the previous active one of the same source.
   */
  createMission(input: CreateMissionInput): { result: InsertResult; mission: Mission; completed: Mission | null } {
    const body = createMissionSchema.parse(input);
    const previous = this.repos.missions.activeMission(body.source);
    const number = this.repos.missions.nextNumber();
    const { result, mission } = this.repos.missions.create({
      id: body.id ?? `mission_${randomUUID()}`,
      name: body.name ?? `MISSION #${String(number).padStart(3, '0')}`,
      startTime: body.startTime ?? new Date().toISOString(),
      notes: body.notes ?? null,
      source: body.source,
      status: 'ACTIVE',
    });
    let completed: Mission | null = null;
    if (result === 'accepted') {
      this.broadcaster.broadcastToWeb({ type: 'mission', mission });
      if (previous && previous.id !== mission.id) {
        completed = this.repos.missions.get(previous.id);
        if (completed) this.broadcaster.broadcastToWeb({ type: 'mission', mission: completed });
      }
    }
    return { result, mission, completed };
  }

  /**
   * Upsert a full Mission record sent by the phone (sync queue or WebSocket). A new id is created with a
   * server-assigned number; an existing id has its mutable fields updated and is reported as 'duplicate'
   * so the sync queue can drop the envelope.
   */
  upsertMission(mission: Mission): { result: InsertResult; mission: Mission } {
    const existing = this.repos.missions.get(mission.id);
    if (existing) {
      const updated = this.repos.missions.update(mission.id, {
        name: mission.name,
        endTime: mission.endTime,
        status: mission.status,
        notes: mission.notes,
      });
      const final = updated ?? existing;
      if (
        final.status !== existing.status ||
        final.endTime !== existing.endTime ||
        final.name !== existing.name ||
        final.notes !== existing.notes
      ) {
        this.broadcaster.broadcastToWeb({ type: 'mission', mission: final });
      }
      return { result: 'duplicate', mission: final };
    }
    const created = this.repos.missions.create({
      id: mission.id,
      name: mission.name,
      startTime: mission.startTime,
      endTime: mission.endTime,
      notes: mission.notes,
      source: mission.source,
      status: mission.status,
    });
    if (created.result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'mission', mission: created.mission });
    return created;
  }

  updateMission(id: string, patch: z.infer<typeof updateMissionSchema>): Mission | null {
    const mission = this.repos.missions.update(id, patch);
    if (mission) this.broadcaster.broadcastToWeb({ type: 'mission', mission });
    return mission;
  }

  thermalImage(image: ThermalImage): InsertResult {
    const result = this.repos.thermalImages.insert(image);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'media', mediaType: 'THERMAL_IMAGE', item: image });
    return result;
  }

  rgbImage(image: RgbImage): InsertResult {
    const result = this.repos.rgbImages.insert(image);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'media', mediaType: 'RGB_IMAGE', item: image });
    return result;
  }

  video(video: VideoRecording): InsertResult {
    const result = this.repos.videos.insert(video);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'media', mediaType: 'VIDEO', item: video });
    return result;
  }

  /** Store map metadata in SQLite and the points/trajectory in media/maps/<id>.json. */
  async map(upload: ThermalMapUpload): Promise<{ result: InsertResult; map: ThermalMap }> {
    const existing = this.repos.maps.get(upload.id);
    if (existing) return { result: 'duplicate', map: existing };
    const { points, trajectory, ...meta } = upload;
    const filePath = await this.store.writeMap(upload.id, { id: upload.id, points, trajectory } satisfies ThermalMapFile);
    const map: ThermalMap = { ...meta, pointCount: points.length, filePath };
    const result = this.repos.maps.insert(map);
    if (result === 'accepted') this.broadcaster.broadcastToWeb({ type: 'media', mediaType: 'THERMAL_MAP', item: map });
    return { result, map };
  }

  async readMapFile(id: string): Promise<ThermalMapFile | null> {
    return this.store.readMap<ThermalMapFile>(id);
  }

  async deleteMap(id: string): Promise<boolean> {
    const deleted = this.repos.maps.delete(id);
    if (deleted) await this.store.removeMap(id);
    return deleted;
  }

  /** Robot status reports have no id: every report is appended to the history and broadcast. */
  robot(status: RobotStatus): void {
    this.repos.robot.recordStatus(status);
    this.broadcaster.broadcastToWeb({ type: 'robot', status });
  }

  imu(samples: ImuSample[]): number {
    return this.repos.imu.insertMany(samples);
  }

  // ---- validation helpers shared by the REST and sync paths -------------------------------------

  parseSensor = (v: unknown): SensorReading => sensorReadingSchema.parse(v);
  parseAlert = (v: unknown): Alert => alertSchema.parse(v);
  parseThermalImage = (v: unknown): ThermalImage => thermalImageSchema.parse(v);
  parseRgbImage = (v: unknown): RgbImage => rgbImageSchema.parse(v);
  parseVideo = (v: unknown): VideoRecording => videoRecordingSchema.parse(v);
  parseMap = (v: unknown): ThermalMapUpload => thermalMapUploadSchema.parse(v);
  parseMission = (v: unknown): Mission => missionSchema.parse(v);
  parseRobot = (v: unknown): RobotStatus => robotStatusSchema.parse(v);
  parseImuBatch = (v: unknown): ImuSample[] => imuBatchSchema.parse(v).samples;

  get logger(): FastifyBaseLogger {
    return this.log;
  }
}
