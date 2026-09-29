import type { Alert, ImuSample, RgbImage, RobotStatus, SensorReading, ThermalImage, VideoRecording } from '@robodog/shared';
import type { ThermalMapUpload } from '../services/ingest.js';

let counter = 0;
const nextId = (prefix: string): string => `${prefix}_${++counter}_${Date.now()}`;
const now = (): string => new Date().toISOString();

export function sensorReading(overrides: Partial<SensorReading> = {}): SensorReading {
  return {
    id: nextId('sensor'),
    timestamp: now(),
    missionId: null,
    source: 'REAL',
    temperatureC: 24.5,
    humidityPct: 55,
    gasRaw: 1800,
    gasAlert: false,
    position: null,
    ...overrides,
  };
}

export function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: nextId('alert'),
    type: 'GAS_ALERT',
    severity: 'CRITICAL',
    timestamp: now(),
    message: 'Gas alert',
    metadata: { gasRaw: 2500 },
    missionId: null,
    position: null,
    source: 'REAL',
    thermalImageId: null,
    rgbImageId: null,
    acknowledged: false,
    ...overrides,
  };
}

export function thermalImage(overrides: Partial<ThermalImage> = {}): ThermalImage {
  const id = overrides.id ?? nextId('thermal');
  return {
    id,
    timestamp: now(),
    missionId: null,
    cameraModel: 'Fluke iSee TC01A',
    width: 256,
    height: 192,
    fileName: `${id}.jpg`,
    filePath: `content://phone/${id}.jpg`,
    palette: 'IRON',
    frameFormat: 'YUY2',
    radiometric: false,
    centerTemperature: null,
    minTemperature: null,
    maxTemperature: null,
    emissivity: null,
    distance: null,
    x: null,
    y: null,
    z: null,
    positionFrame: null,
    source: 'REAL',
    sizeBytes: null,
    uploaded: false,
    ...overrides,
  };
}

export function rgbImage(overrides: Partial<RgbImage> = {}): RgbImage {
  const id = overrides.id ?? nextId('rgb');
  return {
    id,
    timestamp: now(),
    missionId: null,
    cameraId: '0',
    width: 1920,
    height: 1080,
    fileName: `${id}.jpg`,
    filePath: `content://phone/${id}.jpg`,
    associatedThermalImageId: null,
    x: null,
    y: null,
    z: null,
    positionFrame: null,
    source: 'REAL',
    sizeBytes: null,
    uploaded: false,
    ...overrides,
  };
}

export function video(overrides: Partial<VideoRecording> = {}): VideoRecording {
  const id = overrides.id ?? nextId('video');
  return {
    id,
    kind: 'THERMAL',
    timestamp: now(),
    endTimestamp: null,
    missionId: null,
    cameraModel: 'Fluke iSee TC01A',
    width: 256,
    height: 192,
    fileName: `${id}.mp4`,
    filePath: `content://phone/${id}.mp4`,
    durationMs: 12000,
    frameCount: 300,
    codec: 'h264',
    palette: 'IRON',
    source: 'REAL',
    sizeBytes: null,
    uploaded: false,
    ...overrides,
  };
}

export function mapUpload(overrides: Partial<ThermalMapUpload> = {}): ThermalMapUpload {
  const id = overrides.id ?? nextId('map');
  const ts = now();
  return {
    id,
    missionId: null,
    timestamp: ts,
    name: 'Test map',
    dimension: '2D',
    poseSource: 'IMU_DEAD_RECKONING',
    hasDepth: false,
    hasTemperature: false,
    pointCount: 2,
    filePath: null,
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: null, maxZ: null },
    source: 'REAL',
    points: [
      { x: 0, y: 0, z: null, thermalIntensity: 0.2, temperature: null, timestamp: ts, frameId: 'f1' },
      { x: 1, y: 1, z: null, thermalIntensity: 0.9, temperature: null, timestamp: ts, frameId: 'f2' },
    ],
    trajectory: [{ x: 0, y: 0, z: null, timestamp: ts }],
    ...overrides,
  };
}

export function robotStatus(overrides: Partial<RobotStatus> = {}): RobotStatus {
  return {
    timestamp: now(),
    source: 'REAL',
    phoneConnected: true,
    esp32Connected: true,
    thermalCameraConnected: false,
    robotConnected: false,
    batteryPct: 87,
    motorState: null,
    legState: null,
    imuAvailable: true,
    moving: false,
    slamStatus: null,
    gps: null,
    lidarAvailable: false,
    activeMissionId: null,
    extra: {},
    ...overrides,
  };
}

export function imuSample(overrides: Partial<ImuSample> = {}): ImuSample {
  return {
    timestamp: now(),
    monotonicNs: 123456789,
    missionId: null,
    ax: 0,
    ay: 0,
    az: 9.81,
    gx: 0,
    gy: 0,
    gz: 0,
    mx: null,
    my: null,
    mz: null,
    ...overrides,
  };
}
