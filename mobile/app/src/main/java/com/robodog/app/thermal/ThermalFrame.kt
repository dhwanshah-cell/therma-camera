package com.robodog.app.thermal

import com.robodog.app.core.DataSource
import com.robodog.app.thermal.usb.UvcPixelFormat

/**
 * One decoded thermal frame.
 *
 * [intensity] is the raw per-pixel sensor value (8- or 16-bit domain, see [intensityBits])
 * and is always real data from the stream. [cameraColor] holds the camera's own colourised
 * image when the stream carries chroma (or is MJPEG). [radiometric] is null unless an
 * explicitly enabled decoder produced temperatures; nothing here is ever inferred from colours.
 */
class ThermalFrame(
    val frameId: String,
    val timestampMs: Long,
    val monotonicNs: Long,
    val sequence: Int,
    val width: Int,
    val height: Int,
    val sourceWidth: Int,
    val sourceHeight: Int,
    val pixelFormat: UvcPixelFormat,
    val intensity: IntArray,
    val intensityBits: Int,
    val intensityMin: Int,
    val intensityMax: Int,
    val cameraColor: IntArray?,
    val hasChroma: Boolean,
    /** Bottom half of a stacked frame (raw bytes), kept verbatim for the radiometric decoders. */
    val rawLowerHalf: ByteArray?,
    val radiometric: RadiometricResult?,
    val source: DataSource,
    val layout: FrameLayout,
) {
    val pixelCount: Int get() = width * height
    val centerIntensity: Int get() = intensity[(height / 2) * width + width / 2]

    /** Intensity normalised into 0..1 using this frame's min/max. */
    fun normalizedIntensity(index: Int): Float {
        val range = (intensityMax - intensityMin).coerceAtLeast(1)
        return (intensity[index] - intensityMin).toFloat() / range
    }
}

enum class FrameLayout {
    /** Frame is a single image. */
    SINGLE,
    /** Frame height was twice the expected image height: top half image, bottom half raw data. */
    STACKED_IMAGE_RAW,
}

/** Output of a radiometric decoder. Values are Celsius. */
class RadiometricResult(
    val decoderName: String,
    val centerC: Float,
    val minC: Float,
    val maxC: Float,
    /** Per-pixel Celsius, same layout as [ThermalFrame.intensity]; may be null to save memory. */
    val perPixelC: FloatArray?,
    val maxIndex: Int,
    val minIndex: Int,
)
