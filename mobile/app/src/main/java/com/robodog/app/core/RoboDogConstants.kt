package com.robodog.app.core

/**
 * Shared constants. Keep in sync with shared/src/constants.ts in the monorepo.
 */
object RoboDogConstants {
    // ESP32 sensor board access point
    const val ESP32_SSID = "ROBO-DOG"
    /** Development default only; editable in Settings. */
    const val ESP32_DEFAULT_PASSWORD = "robodog123"
    const val ESP32_BASE_URL = "http://192.168.4.1"
    const val ESP32_SENSORS_URL = "http://192.168.4.1/api/sensors"
    const val ESP32_POLL_INTERVAL_MS = 1000L
    const val ESP32_DISCONNECT_AFTER_FAILURES = 3

    // Fluke iSee TC01A thermal camera (USB identification observed on the connected device)
    const val TC01A_MODEL = "Fluke iSee TC01A"
    const val TC01A_VENDOR_ID = 0x0F7E
    const val TC01A_PRODUCT_ID = 0x00BC
    const val TC01A_WIDTH = 256
    const val TC01A_HEIGHT = 192
    const val TC01A_NOMINAL_FPS = 25
    const val TC01A_RANGE_MIN_C = -10.0
    const val TC01A_RANGE_MAX_C = 550.0

    // USB Video Class
    const val USB_CLASS_VIDEO = 0x0E
    const val USB_SUBCLASS_VIDEOCONTROL = 0x01
    const val USB_SUBCLASS_VIDEOSTREAMING = 0x02
    const val USB_SUBCLASS_VIDEO_INTERFACE_COLLECTION = 0x03
    const val USB_CLASS_MISC = 0xEF

    // Storage layout (relative to Pictures/ or Movies/ in MediaStore)
    const val DIR_THERMAL_IMAGES = "RoboDog/Thermal/Images"
    const val DIR_THERMAL_VIDEOS = "RoboDog/Thermal/Videos"
    const val DIR_THERMAL_MAPS = "RoboDog/Thermal/Maps"
    const val DIR_THERMAL_REPORTS = "RoboDog/Thermal/Reports"
    const val DIR_RGB_IMAGES = "RoboDog/RGB/Images"
    const val DIR_RGB_VIDEOS = "RoboDog/RGB/Videos"

    // Backend
    const val API_HEALTH = "/api/health"
    const val API_SENSORS = "/api/sensors"
    const val API_ALERTS = "/api/alerts"
    const val API_MISSIONS = "/api/missions"
    const val API_THERMAL_IMAGES = "/api/thermal/images"
    const val API_THERMAL_VIDEOS = "/api/thermal/videos"
    const val API_RGB_IMAGES = "/api/rgb/images"
    const val API_RGB_VIDEOS = "/api/rgb/videos"
    const val API_MAPS = "/api/maps"
    const val API_ROBOT = "/api/robot"
    const val API_IMU = "/api/imu"
    const val API_SYNC = "/api/sync"
    const val WS_PATH = "/ws"
    const val AUTH_HEADER = "x-robodog-token"

    const val LIVE_THERMAL_FPS = 8
    const val LIVE_RGB_FPS = 4
    const val LIVE_JPEG_QUALITY = 70

    /** Default thermal intensity hotspot threshold (0..1 of the frame's dynamic range). */
    const val DEFAULT_INTENSITY_HOTSPOT_THRESHOLD = 0.92f
    /** Default temperature hotspot threshold in Celsius (only used when radiometric data exists). */
    const val DEFAULT_TEMPERATURE_HOTSPOT_C = 60.0f
}
