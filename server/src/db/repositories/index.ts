import type { Db } from '../database.js';
import { AlertRepository } from './alerts.js';
import { DeviceRepository } from './devices.js';
import { ImuRepository } from './imu.js';
import { ThermalMapRepository } from './maps.js';
import { MissionRepository } from './missions.js';
import { RgbImageRepository } from './rgbImages.js';
import { RobotRepository } from './robot.js';
import { SensorRepository } from './sensors.js';
import { SyncLogRepository } from './syncLog.js';
import { ThermalImageRepository } from './thermalImages.js';
import { VideoRepository } from './videos.js';

export interface Repositories {
  missions: MissionRepository;
  sensors: SensorRepository;
  alerts: AlertRepository;
  thermalImages: ThermalImageRepository;
  rgbImages: RgbImageRepository;
  videos: VideoRepository;
  maps: ThermalMapRepository;
  imu: ImuRepository;
  robot: RobotRepository;
  syncLog: SyncLogRepository;
  devices: DeviceRepository;
}

export function createRepositories(db: Db): Repositories {
  return {
    missions: new MissionRepository(db),
    sensors: new SensorRepository(db),
    alerts: new AlertRepository(db),
    thermalImages: new ThermalImageRepository(db),
    rgbImages: new RgbImageRepository(db),
    videos: new VideoRepository(db),
    maps: new ThermalMapRepository(db),
    imu: new ImuRepository(db),
    robot: new RobotRepository(db),
    syncLog: new SyncLogRepository(db),
    devices: new DeviceRepository(db),
  };
}

export * from './common.js';
export * from './alerts.js';
export * from './devices.js';
export * from './imu.js';
export * from './maps.js';
export * from './missions.js';
export * from './rgbImages.js';
export * from './robot.js';
export * from './sensors.js';
export * from './syncLog.js';
export * from './thermalImages.js';
export * from './videos.js';
