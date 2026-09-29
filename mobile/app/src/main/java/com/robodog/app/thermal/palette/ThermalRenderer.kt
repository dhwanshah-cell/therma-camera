package com.robodog.app.thermal.palette

import com.robodog.app.thermal.ThermalFrame

/**
 * Turns a [ThermalFrame] into ARGB pixels. Automatic gain: per-frame min/max with
 * optional percentile clipping so a single hot pixel does not flatten the image.
 */
object ThermalRenderer {
    fun render(frame: ThermalFrame, palette: ThermalPalette, out: IntArray, clipPercent: Float = 0.5f): IntArray {
        if (palette == ThermalPalette.CAMERA && frame.cameraColor != null) {
            System.arraycopy(frame.cameraColor, 0, out, 0, frame.pixelCount)
            return out
        }
        val (lo, hi) = agcRange(frame, clipPercent)
        val lut = palette.lut
        val range = (hi - lo).coerceAtLeast(1)
        val src = frame.intensity
        for (i in 0 until frame.pixelCount) {
            var idx = ((src[i] - lo) * 255) / range
            if (idx < 0) idx = 0 else if (idx > 255) idx = 255
            out[i] = lut[idx]
        }
        return out
    }

    /** Histogram-based low/high clipping bounds in the frame's intensity domain. */
    fun agcRange(frame: ThermalFrame, clipPercent: Float): Pair<Int, Int> {
        if (clipPercent <= 0f || frame.pixelCount < 64) return frame.intensityMin to frame.intensityMax
        val bins = 1024
        val span = (frame.intensityMax - frame.intensityMin).coerceAtLeast(1)
        val hist = IntArray(bins)
        val src = frame.intensity
        for (i in 0 until frame.pixelCount) {
            val b = ((src[i] - frame.intensityMin).toLong() * (bins - 1) / span).toInt()
            hist[b]++
        }
        val clip = (frame.pixelCount * clipPercent / 100f).toInt()
        var acc = 0; var loBin = 0
        while (loBin < bins - 1 && acc + hist[loBin] < clip) { acc += hist[loBin]; loBin++ }
        acc = 0; var hiBin = bins - 1
        while (hiBin > loBin && acc + hist[hiBin] < clip) { acc += hist[hiBin]; hiBin-- }
        val lo = frame.intensityMin + (loBin.toLong() * span / (bins - 1)).toInt()
        val hi = frame.intensityMin + (hiBin.toLong() * span / (bins - 1)).toInt()
        return if (hi > lo) lo to hi else frame.intensityMin to frame.intensityMax
    }
}
