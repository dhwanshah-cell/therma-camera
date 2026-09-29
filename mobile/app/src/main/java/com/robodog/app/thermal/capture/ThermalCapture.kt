package com.robodog.app.thermal.capture

import android.graphics.Bitmap
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.storage.MediaStorage
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.palette.ThermalRenderer

/** Saves the current thermal frame as thermal_YYYYMMDD_HHMMSS.jpg plus honest metadata. */
class ThermalCapture(private val storage: MediaStorage) {

    fun capture(frame: ThermalFrame, palette: ThermalPalette, missionId: String?, position: Position?, cameraModel: String = RoboDogConstants.TC01A_MODEL): ThermalImage {
        val argb = IntArray(frame.pixelCount)
        ThermalRenderer.render(frame, palette, argb)
        val bitmap = ThermalFrameProcessor.toBitmap(argb, frame.width, frame.height)
        val fileName = "thermal_${TimeFormat.fileStamp(frame.timestampMs)}.jpg"
        val saved = storage.saveJpeg(bitmap, RoboDogConstants.DIR_THERMAL_IMAGES, fileName)
        bitmap.recycle()
        val rad = frame.radiometric
        val effectivePalette = if (palette == ThermalPalette.CAMERA && frame.cameraColor == null) ThermalPalette.IRON else palette
        return ThermalImage(
            id = Ids.thermalImage(),
            timestamp = TimeFormat.iso(frame.timestampMs),
            missionId = missionId,
            cameraModel = if (frame.source == com.robodog.app.core.DataSource.SIMULATION) "SIMULATION" else cameraModel,
            width = frame.width,
            height = frame.height,
            fileName = saved.fileName,
            filePath = saved.uri.toString(),
            palette = effectivePalette.name,
            frameFormat = frame.pixelFormat.name,
            radiometric = rad != null,
            centerTemperature = rad?.centerC?.toDouble(),
            minTemperature = rad?.minC?.toDouble(),
            maxTemperature = rad?.maxC?.toDouble(),
            emissivity = null, // the TC01A UVC stream does not expose emissivity
            distance = null,
            x = position?.x, y = position?.y, z = position?.z, positionFrame = position?.frame,
            source = frame.source,
            sizeBytes = saved.sizeBytes,
            frameId = frame.frameId,
        )
    }

    /** Renders a small thumbnail bitmap for the gallery. */
    fun thumbnail(frame: ThermalFrame, palette: ThermalPalette): Bitmap {
        val argb = IntArray(frame.pixelCount)
        ThermalRenderer.render(frame, palette, argb)
        return ThermalFrameProcessor.toBitmap(argb, frame.width, frame.height)
    }
}
