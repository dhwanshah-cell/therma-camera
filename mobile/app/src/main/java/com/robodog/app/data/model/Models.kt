package com.robodog.app.data.model

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.robodog.app.core.DataSource
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * Domain models. These are both Room entities (local database) and the JSON shapes sent to
 * the backend (kotlinx.serialization), matching shared/src/types.ts field for field.
 * Every "unavailable" value is null — never a placeholder number.
 */

enum class PositionFrame { IMU_DEAD_RECKONING, VISUAL_INERTIAL, ROBOT_ODOMETRY, LIDAR_SLAM, GPS, MANUAL }

@Serializable
data class Position(
    val x: Double,
    val y: Double,
    val z: Double,
    val frame: PositionFrame,
    val confidence: Double?,
)

/** Flattened position columns for Room. */
data class PositionColumns(
    @ColumnInfo(name = "pos_x") val x: Double? = null,
    @ColumnInfo(name = "pos_y") val y: Double? = null,
    @ColumnInfo(name = "pos_z") val z: Double? = null,
    @ColumnInfo(name = "pos_frame") val frame: PositionFrame? = null,
    @ColumnInfo(name = "pos_confidence") val confidence: Double? = null,
) {
    fun toPosition(): Position? = if (x != null && y != null && z != null && frame != null) Position(x, y, z, frame, confidence) else null
    companion object {
        fun from(p: Position?) = if (p == null) PositionColumns() else PositionColumns(p.x, p.y, p.z, p.frame, p.confidence)
    }
}

enum class MissionStatus { ACTIVE, COMPLETED, ABORTED }

@Serializable
@Entity(tableName = "missions")
data class Mission(
    @PrimaryKey val id: String,
    val number: Int,
    val name: String,
    val startTime: String,
    val endTime: String?,
    val status: MissionStatus,
    val notes: String?,
    val source: DataSource,
    @Embedded val stats: MissionStats = MissionStats(),
)

@Serializable
data class MissionStats(
    val thermalImages: Int = 0,
    val rgbImages: Int = 0,
    val videos: Int = 0,
    val sensorReadings: Int = 0,
    val gasAlerts: Int = 0,
    val thermalHotspots: Int = 0,
    val maps: Int = 0,
)

@Serializable
@Entity(tableName = "sensor_readings")
data class SensorReading(
    @PrimaryKey val id: String,
    val timestamp: String,
    val missionId: String?,
    val source: DataSource,
    /** DHT11 temperature °C from the ESP32. */
    val temperatureC: Double?,
    val humidityPct: Double?,
    /** MQ-series raw ADC value. Not a calibrated concentration. */
    val gasRaw: Int?,
    val gasAlert: Boolean,
    val position: Position?,
) {
    /** Epoch millis for time-based association. */
    val epochMs: Long get() = com.robodog.app.core.TimeFormat.epochMs(timestamp)
}

enum class AlertType {
    GAS_ALERT, THERMAL_HOTSPOT, THERMAL_INTENSITY_HOTSPOT, HUMAN_DETECTED, LOW_BATTERY,
    ROBOT_CONNECTION_LOST, ESP32_DISCONNECTED, THERMAL_CAMERA_DISCONNECTED,
}

enum class AlertSeverity { INFO, WARNING, CRITICAL }

@Serializable
@Entity(tableName = "alerts")
data class Alert(
    @PrimaryKey val id: String,
    val type: AlertType,
    val severity: AlertSeverity,
    val timestamp: String,
    val message: String,
    /** JSON object with alert-specific values (gasRaw, temperatureC, humidityPct, maxTemperature...). */
    val metadata: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
    val missionId: String?,
    val position: Position?,
    val source: DataSource,
    val thermalImageId: String? = null,
    val rgbImageId: String? = null,
    val acknowledged: Boolean = false,
)

@Serializable
@Entity(tableName = "thermal_images")
data class ThermalImage(
    @PrimaryKey val id: String,
    val timestamp: String,
    val missionId: String?,
    val cameraModel: String,
    val width: Int,
    val height: Int,
    val fileName: String,
    /** content:// URI on the phone. */
    val filePath: String,
    val palette: String,
    val frameFormat: String?,
    val radiometric: Boolean,
    val centerTemperature: Double?,
    val minTemperature: Double?,
    val maxTemperature: Double?,
    val emissivity: Double?,
    val distance: Double?,
    val x: Double?,
    val y: Double?,
    val z: Double?,
    val positionFrame: PositionFrame?,
    val source: DataSource,
    val sizeBytes: Long?,
    val uploaded: Boolean = false,
    /** Frame id of the live frame this was captured from (for RGB association). */
    @SerialName("frameId") val frameId: String? = null,
)

@Serializable
@Entity(tableName = "rgb_images")
data class RgbImage(
    @PrimaryKey val id: String,
    val timestamp: String,
    val missionId: String?,
    val cameraId: String,
    val width: Int,
    val height: Int,
    val fileName: String,
    val filePath: String,
    val associatedThermalImageId: String?,
    val x: Double?,
    val y: Double?,
    val z: Double?,
    val positionFrame: PositionFrame?,
    val source: DataSource,
    val sizeBytes: Long?,
    val uploaded: Boolean = false,
)

enum class VideoKind { THERMAL, RGB }

@Serializable
@Entity(tableName = "videos")
data class VideoRecording(
    @PrimaryKey val id: String,
    val kind: VideoKind,
    val timestamp: String,
    val endTimestamp: String?,
    val missionId: String?,
    val cameraModel: String,
    val width: Int,
    val height: Int,
    val fileName: String,
    val filePath: String,
    val durationMs: Long?,
    val frameCount: Int?,
    val codec: String,
    val palette: String?,
    val source: DataSource,
    val sizeBytes: Long?,
    val uploaded: Boolean = false,
)

@Serializable
data class ThermalPoint(
    val x: Double,
    val y: Double,
    val z: Double?,
    val thermalIntensity: Double,
    val temperature: Double?,
    val timestamp: String,
    val frameId: String,
)

@Serializable
data class MapBounds(val minX: Double, val maxX: Double, val minY: Double, val maxY: Double, val minZ: Double?, val maxZ: Double?)

@Serializable
data class TrajectoryPoint(val x: Double, val y: Double, val z: Double?, val timestamp: String)

@Serializable
@Entity(tableName = "thermal_maps")
data class ThermalMap(
    @PrimaryKey val id: String,
    val missionId: String?,
    val timestamp: String,
    val name: String,
    val dimension: String, // "2D" | "3D"
    val poseSource: PositionFrame?,
    val hasDepth: Boolean,
    val hasTemperature: Boolean,
    val pointCount: Int,
    /** Local file (JSON with points) path. */
    val filePath: String?,
    @Embedded(prefix = "b_") val bounds: MapBounds?,
    val source: DataSource,
    val uploaded: Boolean = false,
)

/** Full map payload as stored in the JSON file and uploaded to POST /api/maps. */
@Serializable
data class ThermalMapPayload(
    val id: String,
    val missionId: String?,
    val timestamp: String,
    val name: String,
    val dimension: String,
    val poseSource: PositionFrame?,
    val hasDepth: Boolean,
    val hasTemperature: Boolean,
    val pointCount: Int,
    val filePath: String?,
    val bounds: MapBounds?,
    val source: DataSource,
    val points: List<ThermalPoint>,
    val trajectory: List<TrajectoryPoint>,
)

@Serializable
@Entity(tableName = "imu_samples")
data class ImuSample(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0,
    val timestamp: String,
    val monotonicNs: Long,
    val missionId: String?,
    val ax: Float, val ay: Float, val az: Float,
    val gx: Float, val gy: Float, val gz: Float,
    val mx: Float?, val my: Float?, val mz: Float?,
)

@Serializable
data class GpsFix(val lat: Double, val lon: Double, val altitude: Double?, val accuracyM: Double?)

@Serializable
@Entity(tableName = "robot_status")
data class RobotStatus(
    @PrimaryKey(autoGenerate = true) val rowId: Long = 0,
    val timestamp: String,
    val source: DataSource,
    val phoneConnected: Boolean = true,
    val esp32Connected: Boolean,
    val thermalCameraConnected: Boolean,
    val robotConnected: Boolean,
    val batteryPct: Double?,
    val motorState: String?,
    val legState: String?,
    val imuAvailable: Boolean,
    val moving: Boolean?,
    val slamStatus: String?,
    val gps: GpsFix?,
    val lidarAvailable: Boolean,
    val activeMissionId: String?,
    val extra: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
)

/** Row in the offline sync queue. */
@Entity(tableName = "sync_queue")
data class SyncItem(
    @PrimaryKey val id: String,
    /** sensor | alert | thermal_image | rgb_image | video | map | mission | robot | imu_batch */
    val kind: String,
    /** The record id (same as the payload id) used by the server for deduplication. */
    val recordId: String,
    val payloadJson: String,
    /** content:// or file path of a binary to upload after the metadata, if any. */
    val fileUri: String?,
    val createdAt: String,
    val attempts: Int = 0,
    val lastError: String? = null,
    val done: Boolean = false,
)

/** Calibration between the thermal camera and the RGB camera. */
@Serializable
data class CameraIntrinsics(
    val cameraId: String,
    val width: Int,
    val height: Int,
    val horizontalFovDeg: Double?,
    val verticalFovDeg: Double?,
    val fx: Double?, val fy: Double?, val cx: Double?, val cy: Double?,
)

@Serializable
data class Quaternion(val qx: Double, val qy: Double, val qz: Double, val qw: Double) {
    companion object { val IDENTITY = Quaternion(0.0, 0.0, 0.0, 1.0) }
}

@Serializable
data class CameraCalibration(
    val id: String,
    val thermal: CameraIntrinsics,
    val thermalPositionOnRobot: List<Double>,
    val rgb: CameraIntrinsics,
    val rgbPositionOnRobot: List<Double>,
    val relativeRotation: Quaternion,
    val relativeTranslation: List<Double>,
    /** False until a real calibration procedure has filled in the values. */
    val calibrated: Boolean,
)
