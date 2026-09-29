/**
 * RoboDog shared constants. Mirrored in the Android app under
 * mobile/app/src/main/java/com/robodog/app/core/RoboDogConstants.kt
 */

/** ESP32 access point created by the robot's sensor board. */
export const ESP32 = {
  SSID: 'ROBO-DOG',
  /** Development default only. Change on the ESP32 firmware and in the app settings for real deployments. */
  DEFAULT_PASSWORD: 'robodog123',
  BASE_URL: 'http://192.168.4.1',
  SENSORS_PATH: '/api/sensors',
  SENSORS_URL: 'http://192.168.4.1/api/sensors',
  POLL_INTERVAL_MS: 1000,
  /** Number of consecutive failed polls before the ESP32 is reported as DISCONNECTED. */
  DISCONNECT_AFTER_FAILURES: 3,
} as const;

/** Fluke iSee TC01A thermal camera USB identification (observed on the connected device). */
export const TC01A = {
  MODEL: 'Fluke iSee TC01A',
  VENDOR_ID: 0x0f7e,
  PRODUCT_ID: 0x00bc,
  THERMAL_WIDTH: 256,
  THERMAL_HEIGHT: 192,
  NOMINAL_FPS: 25,
  /** Datasheet measurement range. Only meaningful when radiometric data is actually decoded. */
  RANGE_MIN_C: -10,
  RANGE_MAX_C: 550,
} as const;

/** USB Video Class constants used by the descriptor parser and the native driver. */
export const UVC = {
  CLASS_VIDEO: 0x0e,
  SUBCLASS_VIDEOCONTROL: 0x01,
  SUBCLASS_VIDEOSTREAMING: 0x02,
  SUBCLASS_INTERFACE_COLLECTION: 0x03,
} as const;

export const THERMAL_PALETTES = ['CAMERA', 'IRON', 'RAINBOW', 'WHITE_HOT', 'BLACK_HOT', 'LAVA', 'GRAYSCALE'] as const;

export const ALERT_TYPES = [
  'GAS_ALERT',
  'THERMAL_HOTSPOT',
  'THERMAL_INTENSITY_HOTSPOT',
  'HUMAN_DETECTED',
  'LOW_BATTERY',
  'ROBOT_CONNECTION_LOST',
  'ESP32_DISCONNECTED',
  'THERMAL_CAMERA_DISCONNECTED',
] as const;

export const ALERT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;

export const MEDIA_TYPES = ['THERMAL_IMAGE', 'RGB_IMAGE', 'THERMAL_VIDEO', 'RGB_VIDEO', 'THERMAL_MAP'] as const;

export const DATA_SOURCES = ['REAL', 'SIMULATION'] as const;

/** Relative storage layout used on the phone (under Pictures/ and Movies/) and on the server media root. */
export const STORAGE_LAYOUT = {
  THERMAL_IMAGES: 'RoboDog/Thermal/Images',
  THERMAL_VIDEOS: 'RoboDog/Thermal/Videos',
  THERMAL_MAPS: 'RoboDog/Thermal/Maps',
  THERMAL_REPORTS: 'RoboDog/Thermal/Reports',
  RGB_IMAGES: 'RoboDog/RGB/Images',
  RGB_VIDEOS: 'RoboDog/RGB/Videos',
} as const;

export const API = {
  HEALTH: '/api/health',
  SENSORS: '/api/sensors',
  ALERTS: '/api/alerts',
  MISSIONS: '/api/missions',
  THERMAL_IMAGES: '/api/thermal/images',
  THERMAL_VIDEOS: '/api/thermal/videos',
  RGB_IMAGES: '/api/rgb/images',
  RGB_VIDEOS: '/api/rgb/videos',
  MAPS: '/api/maps',
  ROBOT: '/api/robot',
  IMU: '/api/imu',
  SYNC: '/api/sync',
  WS: '/ws',
  MEDIA: '/media',
} as const;

/** Header carrying the shared API token. Query parameter `token` is accepted for WebSocket clients. */
export const AUTH_HEADER = 'x-robodog-token';
/** Safe development default. Override with ROBODOG_API_TOKEN on the server and in the app settings. */
export const DEV_API_TOKEN = 'robodog-dev-token';

/** Live thermal frames pushed from the phone are throttled to this rate (frames per second). */
export const LIVE_THERMAL_FPS = 8;
export const LIVE_RGB_FPS = 4;
