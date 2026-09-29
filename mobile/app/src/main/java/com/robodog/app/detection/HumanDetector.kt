package com.robodog.app.detection

import android.graphics.Bitmap
import com.robodog.app.data.model.Position

/**
 * Module boundary for future human detection.
 *
 * Pipeline: RGB frame → detector → detections with timestamp → thermal frame association →
 * position (if a pose source exists) → HUMAN_DETECTED alert. No detector is bundled; the
 * default implementation reports "unavailable" and never emits a detection.
 */
interface HumanDetector {
    val name: String
    val available: Boolean
    /** Returns detections for the given RGB bitmap, or an empty list. Must never fabricate results. */
    suspend fun detect(rgb: Bitmap, timestampMs: Long): List<Detection>
}

data class Detection(
    val timestampMs: Long,
    val boundingBox: BoundingBox,
    val confidence: Float,
    val label: String,
    val modelName: String,
    /** Filled by the association step, not by the detector. */
    val associatedThermalFrameId: String? = null,
    val position: Position? = null,
)

data class BoundingBox(val x: Float, val y: Float, val width: Float, val height: Float)

/** Default: no model loaded. */
object NoHumanDetector : HumanDetector {
    override val name = "None (no model installed)"
    override val available = false
    override suspend fun detect(rgb: Bitmap, timestampMs: Long): List<Detection> = emptyList()
}
