import { z } from 'zod';
import { ALERT_SEVERITIES, ALERT_TYPES, DATA_SOURCES, THERMAL_PALETTES } from './constants.js';

export const isoTimestamp = z.string().datetime({ offset: true });
export const dataSourceSchema = z.enum(DATA_SOURCES);
export const paletteSchema = z.enum(THERMAL_PALETTES);
export const alertTypeSchema = z.enum(ALERT_TYPES);
export const alertSeveritySchema = z.enum(ALERT_SEVERITIES);

export const positionFrameSchema = z.enum([
  'IMU_DEAD_RECKONING',
  'VISUAL_INERTIAL',
  'ROBOT_ODOMETRY',
  'LIDAR_SLAM',
  'GPS',
  'MANUAL',
]);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  frame: positionFrameSchema,
  confidence: z.number().min(0).max(1).nullable(),
});

export const orientationSchema = z.object({ qx: z.number(), qy: z.number(), qz: z.number(), qw: z.number() });

/** Strict parser for the ESP32 JSON. Extra fields are ignored; wrong types are rejected. */
export const esp32SensorPayloadSchema = z.object({
  temperature: z.number(),
  humidity: z.number(),
  gas_raw: z.number().int().nonnegative(),
  gas_alert: z.boolean(),
});

export const sensorReadingSchema = z.object({
  id: z.string().min(1),
  timestamp: isoTimestamp,
  missionId: z.string().nullable(),
  source: dataSourceSchema,
  temperatureC: z.number().nullable(),
  humidityPct: z.number().nullable(),
  gasRaw: z.number().nullable(),
  gasAlert: z.boolean(),
  position: positionSchema.nullable(),
});

export const alertSchema = z.object({
  id: z.string().min(1),
  type: alertTypeSchema,
  severity: alertSeveritySchema,
  timestamp: isoTimestamp,
  message: z.string(),
  metadata: z.record(z.unknown()).default({}),
  missionId: z.string().nullable(),
  position: positionSchema.nullable(),
  source: dataSourceSchema,
  thermalImageId: z.string().nullable().default(null),
  rgbImageId: z.string().nullable().default(null),
  acknowledged: z.boolean().default(false),
});

export const thermalImageSchema = z.object({
  id: z.string().min(1),
  timestamp: isoTimestamp,
  missionId: z.string().nullable(),
  cameraModel: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileName: z.string().min(1),
  filePath: z.string(),
  palette: paletteSchema,
  frameFormat: z.string().nullable().default(null),
  radiometric: z.boolean().default(false),
  centerTemperature: z.number().nullable(),
  minTemperature: z.number().nullable(),
  maxTemperature: z.number().nullable(),
  emissivity: z.number().nullable(),
  distance: z.number().nullable(),
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable(),
  positionFrame: positionFrameSchema.nullable().default(null),
  source: dataSourceSchema,
  sizeBytes: z.number().nullable().default(null),
  uploaded: z.boolean().default(false),
}).superRefine((img, ctx) => {
  // Temperatures without a radiometric decode are fabricated by definition.
  if (!img.radiometric && (img.centerTemperature !== null || img.minTemperature !== null || img.maxTemperature !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Temperature fields must be null unless radiometric is true',
    });
  }
});

export const rgbImageSchema = z.object({
  id: z.string().min(1),
  timestamp: isoTimestamp,
  missionId: z.string().nullable(),
  cameraId: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileName: z.string().min(1),
  filePath: z.string(),
  associatedThermalImageId: z.string().nullable().default(null),
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable(),
  positionFrame: positionFrameSchema.nullable().default(null),
  source: dataSourceSchema,
  sizeBytes: z.number().nullable().default(null),
  uploaded: z.boolean().default(false),
});

export const videoRecordingSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['THERMAL', 'RGB']),
  timestamp: isoTimestamp,
  endTimestamp: isoTimestamp.nullable(),
  missionId: z.string().nullable(),
  cameraModel: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fileName: z.string().min(1),
  filePath: z.string(),
  durationMs: z.number().nullable(),
  frameCount: z.number().nullable(),
  codec: z.string(),
  palette: paletteSchema.nullable(),
  source: dataSourceSchema,
  sizeBytes: z.number().nullable().default(null),
  uploaded: z.boolean().default(false),
});

export const thermalPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().nullable(),
  thermalIntensity: z.number().min(0).max(1),
  temperature: z.number().nullable(),
  timestamp: isoTimestamp,
  frameId: z.string(),
});

export const thermalMapSchema = z.object({
  id: z.string().min(1),
  missionId: z.string().nullable(),
  timestamp: isoTimestamp,
  name: z.string(),
  dimension: z.enum(['2D', '3D']),
  poseSource: positionFrameSchema.nullable(),
  hasDepth: z.boolean(),
  hasTemperature: z.boolean(),
  pointCount: z.number().int().nonnegative(),
  filePath: z.string().nullable(),
  bounds: z
    .object({
      minX: z.number(),
      maxX: z.number(),
      minY: z.number(),
      maxY: z.number(),
      minZ: z.number().nullable(),
      maxZ: z.number().nullable(),
    })
    .nullable(),
  source: dataSourceSchema,
});

/** Full map payload uploaded from the phone: metadata plus points. */
export const thermalMapUploadSchema = thermalMapSchema.extend({
  points: z.array(thermalPointSchema),
  /** Robot trajectory as ordered poses, empty when no pose source existed. */
  trajectory: z
    .array(z.object({ x: z.number(), y: z.number(), z: z.number().nullable(), timestamp: isoTimestamp }))
    .default([]),
});

export const imuSampleSchema = z.object({
  timestamp: isoTimestamp,
  monotonicNs: z.number(),
  missionId: z.string().nullable(),
  ax: z.number(),
  ay: z.number(),
  az: z.number(),
  gx: z.number(),
  gy: z.number(),
  gz: z.number(),
  mx: z.number().nullable(),
  my: z.number().nullable(),
  mz: z.number().nullable(),
});

export const robotStatusSchema = z.object({
  timestamp: isoTimestamp,
  source: dataSourceSchema,
  phoneConnected: z.boolean(),
  esp32Connected: z.boolean(),
  thermalCameraConnected: z.boolean(),
  robotConnected: z.boolean(),
  batteryPct: z.number().nullable(),
  motorState: z.string().nullable(),
  legState: z.string().nullable(),
  imuAvailable: z.boolean(),
  moving: z.boolean().nullable(),
  slamStatus: z.string().nullable(),
  gps: z
    .object({ lat: z.number(), lon: z.number(), altitude: z.number().nullable(), accuracyM: z.number().nullable() })
    .nullable(),
  lidarAvailable: z.boolean(),
  activeMissionId: z.string().nullable(),
  extra: z.record(z.unknown()).default({}),
});

export const missionStatsSchema = z.object({
  thermalImages: z.number().int().nonnegative(),
  rgbImages: z.number().int().nonnegative(),
  videos: z.number().int().nonnegative(),
  sensorReadings: z.number().int().nonnegative(),
  gasAlerts: z.number().int().nonnegative(),
  thermalHotspots: z.number().int().nonnegative(),
  maps: z.number().int().nonnegative(),
});

export const missionSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  name: z.string(),
  startTime: isoTimestamp,
  endTime: isoTimestamp.nullable(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']),
  notes: z.string().nullable(),
  source: dataSourceSchema,
  stats: missionStatsSchema,
});

/** Body accepted by POST /api/missions. The server assigns the number and stats. */
export const createMissionSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120).optional(),
  startTime: isoTimestamp.optional(),
  notes: z.string().nullable().optional(),
  source: dataSourceSchema.default('REAL'),
});

export const updateMissionSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  endTime: isoTimestamp.nullable().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']).optional(),
  notes: z.string().nullable().optional(),
});

export const syncEnvelopeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['sensor', 'alert', 'thermal_image', 'rgb_image', 'video', 'map', 'mission', 'robot', 'imu_batch']),
  payload: z.unknown(),
  createdAt: isoTimestamp,
  attempts: z.number().int().nonnegative().default(0),
});

export const syncBatchRequestSchema = z.object({
  deviceId: z.string().min(1),
  items: z.array(syncEnvelopeSchema).max(500),
});

export type Esp32SensorPayloadInput = z.input<typeof esp32SensorPayloadSchema>;
