package com.robodog.app.thermal.usb

import com.robodog.app.core.RoboDogConstants

/**
 * Chooses which format/frame to negotiate with the camera, based only on what the
 * descriptors actually advertise. Preference order for a thermal imager:
 *
 * 1. Uncompressed single-channel 16-bit (Y16) at the native thermal resolution
 * 2. Uncompressed YUY2/UYVY/NV12 at the native thermal resolution (or a stacked
 *    "image + raw" layout with double height, as some 256x192 modules use)
 * 3. Any uncompressed frame
 * 4. MJPEG (decoded on the phone; no raw intensity)
 *
 * The selection is explained in [UvcStreamMode.reason] so the UI can show why.
 */
object UvcModeSelector {
    data class Preference(
        val preferredWidth: Int = RoboDogConstants.TC01A_WIDTH,
        val preferredHeight: Int = RoboDogConstants.TC01A_HEIGHT,
        /** Optional explicit choice from Settings; overrides scoring when it exists in the descriptors. */
        val forcedFormatIndex: Int? = null,
        val forcedFrameIndex: Int? = null,
    )

    fun select(desc: UvcDeviceDescription, pref: Preference = Preference()): UvcStreamMode? {
        val candidates = desc.allFrames()
        if (candidates.isEmpty()) return null

        if (pref.forcedFormatIndex != null && pref.forcedFrameIndex != null) {
            candidates.firstOrNull { (f, fr) -> f.formatIndex == pref.forcedFormatIndex && fr.frameIndex == pref.forcedFrameIndex }
                ?.let { (f, fr) -> return UvcStreamMode(f, fr, chooseInterval(fr), "forced by settings") }
        }

        val scored = candidates.map { (f, fr) -> Triple(f, fr, score(f, fr, pref)) }
        val best = scored.maxByOrNull { it.third } ?: return null
        val (f, fr, s) = best
        return UvcStreamMode(f, fr, chooseInterval(fr), explain(f, fr, pref, s))
    }

    /** Prefer the camera's default interval; otherwise the fastest advertised rate. */
    fun chooseInterval(fr: UvcFrame): Long {
        if (fr.defaultFrameInterval > 0) return fr.defaultFrameInterval
        val discrete = if (fr.continuous) fr.intervals.take(1) else fr.intervals
        return discrete.filter { it > 0 }.minOrNull() ?: 400_000L // 25 fps fallback
    }

    private fun score(f: UvcFormat, fr: UvcFrame, pref: Preference): Int {
        var s = 0
        val pf = f.pixelFormat
        s += when (pf) {
            UvcPixelFormat.Y16 -> 500
            UvcPixelFormat.Y8 -> 420
            UvcPixelFormat.YUY2, UvcPixelFormat.UYVY -> 400
            UvcPixelFormat.NV12, UvcPixelFormat.I420 -> 350
            UvcPixelFormat.RGB24, UvcPixelFormat.BGR24 -> 300
            UvcPixelFormat.UNKNOWN -> if (f.kind == UvcFormatKind.UNCOMPRESSED) 250 else 50
            UvcPixelFormat.MJPEG -> 100
            UvcPixelFormat.H264 -> 0
        }
        val exact = fr.width == pref.preferredWidth && fr.height == pref.preferredHeight
        val stacked = fr.width == pref.preferredWidth && fr.height == pref.preferredHeight * 2
        s += when {
            exact -> 200
            stacked -> 180 // image + raw data stacked vertically (seen on several 256x192 modules)
            fr.width == pref.preferredWidth -> 80
            else -> 0
        }
        // Prefer higher default fps slightly
        s += (fr.defaultFps() ?: 0.0).coerceAtMost(30.0).toInt()
        return s
    }

    private fun explain(f: UvcFormat, fr: UvcFrame, pref: Preference, score: Int): String {
        val layout = when {
            fr.width == pref.preferredWidth && fr.height == pref.preferredHeight -> "native ${fr.width}x${fr.height}"
            fr.width == pref.preferredWidth && fr.height == pref.preferredHeight * 2 -> "stacked ${fr.width}x${fr.height} (possible image + raw halves)"
            else -> "${fr.width}x${fr.height}"
        }
        return "${f.pixelFormat} ($layout), score $score"
    }
}
