package com.robodog.app.thermal

/**
 * Pure pixel-format conversions (no Android types) so they can be unit tested.
 * All functions take the frame bytes exactly as delivered by the UVC stream.
 */
object PixelConverters {

    /** Extracts luma from packed YUY2 (Y0 U Y1 V) into [outY] (0..255). Returns min..max. */
    fun yuy2Luma(src: ByteArray, width: Int, height: Int, outY: IntArray, yFirst: Boolean = true): IntRange {
        var mn = 255; var mx = 0
        val n = width * height
        val yOff = if (yFirst) 0 else 1
        var i = 0
        while (i < n) {
            val v = src[i * 2 + yOff].toInt() and 0xFF
            outY[i] = v
            if (v < mn) mn = v
            if (v > mx) mx = v
            i++
        }
        return mn..mx
    }

    /** Full YUY2 → ARGB conversion (BT.601 limited range). Returns whether chroma deviates from grey. */
    fun yuy2ToArgb(src: ByteArray, width: Int, height: Int, out: IntArray, yFirst: Boolean = true): Boolean {
        val n = width * height
        var chromaDeviation = 0L
        var i = 0
        while (i + 1 < n) {
            val b = i * 2
            val y0: Int; val u: Int; val y1: Int; val v: Int
            if (yFirst) { y0 = src[b].toInt() and 0xFF; u = src[b + 1].toInt() and 0xFF; y1 = src[b + 2].toInt() and 0xFF; v = src[b + 3].toInt() and 0xFF }
            else { u = src[b].toInt() and 0xFF; y0 = src[b + 1].toInt() and 0xFF; v = src[b + 2].toInt() and 0xFF; y1 = src[b + 3].toInt() and 0xFF }
            chromaDeviation += kotlin.math.abs(u - 128) + kotlin.math.abs(v - 128)
            out[i] = yuvToArgb(y0, u, v)
            out[i + 1] = yuvToArgb(y1, u, v)
            i += 2
        }
        // Average chroma deviation above ~6 levels means the camera is sending a colour image.
        return chromaDeviation / (n / 2).coerceAtLeast(1) > 6
    }

    fun yuvToArgb(y: Int, u: Int, v: Int): Int {
        val c = y - 16
        val d = u - 128
        val e = v - 128
        val r = clamp((298 * c + 409 * e + 128) shr 8)
        val g = clamp((298 * c - 100 * d - 208 * e + 128) shr 8)
        val b = clamp((298 * c + 516 * d + 128) shr 8)
        return (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }

    /** 16-bit little-endian grey → [out]. Returns min..max. */
    fun gray16(src: ByteArray, count: Int, out: IntArray, littleEndian: Boolean = true): IntRange {
        var mn = 65535; var mx = 0
        for (i in 0 until count) {
            val lo = src[i * 2].toInt() and 0xFF
            val hi = src[i * 2 + 1].toInt() and 0xFF
            val v = if (littleEndian) lo or (hi shl 8) else hi or (lo shl 8)
            out[i] = v
            if (v < mn) mn = v
            if (v > mx) mx = v
        }
        return mn..mx
    }

    fun gray8(src: ByteArray, count: Int, out: IntArray): IntRange {
        var mn = 255; var mx = 0
        for (i in 0 until count) {
            val v = src[i].toInt() and 0xFF
            out[i] = v
            if (v < mn) mn = v
            if (v > mx) mx = v
        }
        return mn..mx
    }

    /** NV12 / I420 luma plane is simply the first width*height bytes. */
    fun planarLuma(src: ByteArray, count: Int, out: IntArray): IntRange = gray8(src, count, out)

    fun nv12ToArgb(src: ByteArray, width: Int, height: Int, out: IntArray): Boolean {
        val n = width * height
        var dev = 0L
        for (y in 0 until height) {
            val uvRow = n + (y / 2) * width
            for (x in 0 until width) {
                val yy = src[y * width + x].toInt() and 0xFF
                val u = src[uvRow + (x and 1.inv())].toInt() and 0xFF
                val v = src[uvRow + (x and 1.inv()) + 1].toInt() and 0xFF
                dev += kotlin.math.abs(u - 128) + kotlin.math.abs(v - 128)
                out[y * width + x] = yuvToArgb(yy, u, v)
            }
        }
        return dev / n.coerceAtLeast(1) > 6
    }

    fun i420ToArgb(src: ByteArray, width: Int, height: Int, out: IntArray): Boolean {
        val n = width * height
        val uOff = n
        val vOff = n + n / 4
        val cw = width / 2
        var dev = 0L
        for (y in 0 until height) {
            for (x in 0 until width) {
                val yy = src[y * width + x].toInt() and 0xFF
                val ci = (y / 2) * cw + x / 2
                val u = src[uOff + ci].toInt() and 0xFF
                val v = src[vOff + ci].toInt() and 0xFF
                dev += kotlin.math.abs(u - 128) + kotlin.math.abs(v - 128)
                out[y * width + x] = yuvToArgb(yy, u, v)
            }
        }
        return dev / n.coerceAtLeast(1) > 6
    }

    fun rgb24ToArgb(src: ByteArray, count: Int, out: IntArray, bgr: Boolean) {
        for (i in 0 until count) {
            val a = src[i * 3].toInt() and 0xFF
            val b = src[i * 3 + 1].toInt() and 0xFF
            val c = src[i * 3 + 2].toInt() and 0xFF
            out[i] = if (bgr) (0xFF shl 24) or (c shl 16) or (b shl 8) or a else (0xFF shl 24) or (a shl 16) or (b shl 8) or c
        }
    }

    /** Luma from ARGB pixels (for MJPEG decoded frames). */
    fun argbLuma(argb: IntArray, out: IntArray): IntRange {
        var mn = 255; var mx = 0
        for (i in argb.indices) {
            val p = argb[i]
            val r = (p shr 16) and 0xFF; val g = (p shr 8) and 0xFF; val b = p and 0xFF
            val y = (r * 299 + g * 587 + b * 114) / 1000
            out[i] = y
            if (y < mn) mn = y
            if (y > mx) mx = y
        }
        return mn..mx
    }

    private fun clamp(v: Int) = if (v < 0) 0 else if (v > 255) 255 else v
}
