package com.robodog.app.rgb

import android.content.Context
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.data.model.CameraCalibration
import com.robodog.app.data.model.CameraIntrinsics
import com.robodog.app.data.model.Quaternion
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Thermal ↔ RGB extrinsic/intrinsic calibration. The cameras are NOT assumed to be aligned;
 * the default calibration is explicitly marked `calibrated = false` and all optics fields are
 * null until a calibration procedure fills them in. Used later for thermal-on-RGB overlay.
 */
class CalibrationStore(private val context: Context) {
    private val json = Json { prettyPrint = true; ignoreUnknownKeys = true }
    private val file get() = File(context.filesDir, "camera_calibration.json")

    fun load(): CameraCalibration = runCatching { json.decodeFromString(CameraCalibration.serializer(), file.readText()) }.getOrElse { default() }

    fun save(c: CameraCalibration) { file.writeText(json.encodeToString(CameraCalibration.serializer(), c)) }

    fun default() = CameraCalibration(
        id = "default",
        thermal = CameraIntrinsics(RoboDogConstants.TC01A_MODEL, RoboDogConstants.TC01A_WIDTH, RoboDogConstants.TC01A_HEIGHT, null, null, null, null, null, null),
        thermalPositionOnRobot = listOf(0.0, 0.0, 0.0),
        rgb = CameraIntrinsics(RgbCameraController.CAMERA_ID, 0, 0, null, null, null, null, null, null),
        rgbPositionOnRobot = listOf(0.0, 0.0, 0.0),
        relativeRotation = Quaternion.IDENTITY,
        relativeTranslation = listOf(0.0, 0.0, 0.0),
        calibrated = false,
    )
}
