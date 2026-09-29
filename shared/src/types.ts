import type {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  DATA_SOURCES,
  MEDIA_TYPES,
  THERMAL_PALETTES,
} from './constants.js';

/** ISO-8601 timestamp string (UTC). */
export type IsoTimestamp = string;

/** Every record states whether it came from real hardware or the clearly labelled simulation mode. */
export type DataSource = (typeof DATA_SOURCES)[number];

export type ThermalPalette = (typeof THERMAL_PALETTES)[number];
export type AlertType = (typeof ALERT_TYPES)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * A position in the mission frame. Units are metres. `frame` names the source so that consumers
 * never mistake IMU dead reckoning for a surveyed position.
 */
export interface Position {
  x: number;
  y: number;
  z: number;
  /** Which localisation source produced this position. */
  frame: 'IMU_DEAD_RECKONING' | 'VISUAL_INERTIAL' | 'ROBOT_ODOMETRY' | 'LIDAR_SLAM' | 'GPS' | 'MANUAL';
  /** 0..1 confidence; IMU-only dead reckoning must be reported as low confidence. */
  confidence: number | null;
}

/** Orientation as a unit quaternion. */
export interface Orientation {
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface Pose {
  position: Position;
  orientation: Orientation | null;
  timestamp: IsoTimestamp;
}

/** Raw ESP32 payload exactly as served by GET http://192.168.4.1/api/sensors. */
export interface Esp32SensorPayload {
  temperature: number;
  humidity: number;
  gas_raw: number;
  gas_alert: boolean;
}

/** Sensor reading persisted on the phone and on the server. */
export interface SensorReading {
  id: string;
  timestamp: IsoTimestamp;
  missionId: string | null;
  source: DataSource;
  /** DHT11 environmental temperature in Celsius, null when the ESP32 did not report it. */
  temperatureC: number | null;
  /** DHT11 relative humidity in percent. */
  humidityPct: number | null;
  /** MQ-series raw ADC value. NOT a calibrated ppm value. */
  gasRaw: number | null;
  gasAlert: boolean;
  position: Position | null;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: IsoTimestamp;
  message: string;
  /** Free-form structured details, e.g. { gasRaw, temperatureC, humidityPct } for a GAS_ALERT. */
  metadata: Record<string, unknown>;
  missionId: string | null;
  position: Position | null;
  source: DataSource;
  /** Optional associated media ids. */
  thermalImageId: string | null;
  rgbImageId: string | null;
  acknowledged: boolean;
}

export interface ThermalImage {
  id: string;
  timestamp: IsoTimestamp;
  missionId: string | null;
  cameraModel: string;
  width: number;
  height: number;
  /** File name only, e.g. thermal_20260929_143000.jpg */
  fileName: string;
  /** Phone-local URI or server-relative media path. */
  filePath: string;
  palette: ThermalPalette;
  /** Negotiated UVC frame format, e.g. YUY2, Y16, MJPEG. */
  frameFormat: string | null;
  /** True only when a real radiometric decode produced the temperatures below. */
  radiometric: boolean;
  centerTemperature: number | null;
  minTemperature: number | null;
  maxTemperature: number | null;
  emissivity: number | null;
  distance: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  positionFrame: Position['frame'] | null;
  source: DataSource;
  sizeBytes: number | null;
  /** Server-side: set once the binary has been uploaded. */
  uploaded: boolean;
}

export interface RgbImage {
  id: string;
  timestamp: IsoTimestamp;
  missionId: string | null;
  cameraId: string;
  width: number;
  height: number;
  fileName: string;
  filePath: string;
  /** Thermal frame captured closest in time, if any. */
  associatedThermalImageId: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  positionFrame: Position['frame'] | null;
  source: DataSource;
  sizeBytes: number | null;
  uploaded: boolean;
}

export interface VideoRecording {
  id: string;
  kind: 'THERMAL' | 'RGB';
  timestamp: IsoTimestamp;
  endTimestamp: IsoTimestamp | null;
  missionId: string | null;
  cameraModel: string;
  width: number;
  height: number;
  fileName: string;
  filePath: string;
  durationMs: number | null;
  frameCount: number | null;
  codec: string;
  palette: ThermalPalette | null;
  source: DataSource;
  sizeBytes: number | null;
  uploaded: boolean;
}

/** One mapped thermal sample. Depth-less cameras cannot populate z; see ThermalMap.hasDepth. */
export interface ThermalPoint {
  x: number;
  y: number;
  /** null when no depth/pose source produced a height. */
  z: number | null;
  /** 0..1 normalised thermal intensity from the image sensor. Always available for a real frame. */
  thermalIntensity: number;
  /** Celsius, only when radiometric data was decoded. */
  temperature: number | null;
  timestamp: IsoTimestamp;
  frameId: string;
}

export interface ThermalMap {
  id: string;
  missionId: string | null;
  timestamp: IsoTimestamp;
  name: string;
  /** '2D' maps are built from frames + planar pose; '3D' maps require a depth/pose source. */
  dimension: '2D' | '3D';
  /** Names the spatial source, or null when the map is image-space only. */
  poseSource: Position['frame'] | null;
  hasDepth: boolean;
  hasTemperature: boolean;
  pointCount: number;
  /** Server-relative path to the exported map file (JSON or PNG). */
  filePath: string | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number | null; maxZ: number | null } | null;
  source: DataSource;
}

export interface ImuSample {
  timestamp: IsoTimestamp;
  /** Monotonic phone timestamp in nanoseconds for precise frame association. */
  monotonicNs: number;
  missionId: string | null;
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

export interface RobotStatus {
  timestamp: IsoTimestamp;
  source: DataSource;
  phoneConnected: boolean;
  esp32Connected: boolean;
  thermalCameraConnected: boolean;
  /** Robot body controller link (not the ESP32 sensor board). */
  robotConnected: boolean;
  batteryPct: number | null;
  motorState: string | null;
  legState: string | null;
  imuAvailable: boolean;
  moving: boolean | null;
  slamStatus: string | null;
  gps: { lat: number; lon: number; altitude: number | null; accuracyM: number | null } | null;
  lidarAvailable: boolean;
  activeMissionId: string | null;
  /** Free-form extra fields for future controllers. */
  extra: Record<string, unknown>;
}

export interface Mission {
  id: string;
  /** Sequential display number, e.g. 1 -> "MISSION #001". */
  number: number;
  name: string;
  startTime: IsoTimestamp;
  endTime: IsoTimestamp | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABORTED';
  notes: string | null;
  source: DataSource;
  /** Aggregated counters, computed by the server or the phone. */
  stats: MissionStats;
}

export interface MissionStats {
  thermalImages: number;
  rgbImages: number;
  videos: number;
  sensorReadings: number;
  gasAlerts: number;
  thermalHotspots: number;
  maps: number;
}

/** Extrinsic/intrinsic calibration between the thermal camera and the RGB camera. */
export interface CameraCalibration {
  id: string;
  thermal: CameraIntrinsics & { positionOnRobot: [number, number, number] };
  rgb: CameraIntrinsics & { positionOnRobot: [number, number, number] };
  /** Rotation from thermal to RGB camera frame as a unit quaternion. */
  relativeRotation: Orientation;
  /** Translation from thermal to RGB camera frame in metres. */
  relativeTranslation: [number, number, number];
  /** True once a real calibration procedure has populated these values. */
  calibrated: boolean;
}

export interface CameraIntrinsics {
  cameraId: string;
  width: number;
  height: number;
  horizontalFovDeg: number | null;
  verticalFovDeg: number | null;
  fx: number | null;
  fy: number | null;
  cx: number | null;
  cy: number | null;
}

/** Placeholder result type for the future human-detection module. Never populated by a fake detector. */
export interface HumanDetection {
  id: string;
  timestamp: IsoTimestamp;
  missionId: string | null;
  rgbImageId: string | null;
  thermalImageId: string | null;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
  position: Position | null;
  modelName: string;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  simulation: boolean;
  uptimeSeconds: number;
  time: IsoTimestamp;
}

/** Envelope for the phone's sync queue. `id` is the record id so re-uploads are idempotent. */
export interface SyncEnvelope<T = unknown> {
  id: string;
  kind: 'sensor' | 'alert' | 'thermal_image' | 'rgb_image' | 'video' | 'map' | 'mission' | 'robot' | 'imu_batch';
  payload: T;
  createdAt: IsoTimestamp;
  attempts: number;
}

export interface SyncBatchRequest {
  deviceId: string;
  items: SyncEnvelope[];
}

export interface SyncBatchResponse {
  accepted: string[];
  duplicates: string[];
  rejected: { id: string; reason: string }[];
}
