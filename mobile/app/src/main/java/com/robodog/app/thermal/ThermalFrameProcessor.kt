package com.robodog.app.thermal

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.thermal.radiometric.RadiometricDecoder
import com.robodog.app.thermal.radiometric.RadiometricDecoders
import com.robodog.app.thermal.usb.UvcPixelFormat

/**
 * Converts raw UVC frame bytes into a [ThermalFrame]. Handles every pixel format the
 * descriptor parser can identify plus MJPEG (decoded through BitmapFactory).
 */
class ThermalFrameProcessor(
    var decoder: RadiometricDecoder = RadiometricDecoders.NONE,
    /** Expected image height; a frame exactly twice as tall is treated as image + raw halves. */
    var expectedImageHeight: Int = RoboDogConstants.TC01A_HEIGHT,
    var stackedLayoutMode: StackedLayoutMode = StackedLayoutMode.AUTO,
) {
    enum class StackedLayoutMode { AUTO, NEVER, ALWAYS }

    /** How to read a double-height (image + raw) frame. AUTO picks the interpretation that looks like a real image. */
    enum class StackedDecode(val label: String) {
        AUTO("Auto-detect"),
        YUY2_TOP("8-bit image, top half"),
        YUY2_BOTTOM("8-bit image, bottom half"),
        RAW16_TOP("16-bit raw, top half"),
        RAW16_BOTTOM("16-bit raw, bottom half"),
    }
    var stackedDecode: StackedDecode = StackedDecode.AUTO
    @Volatile var autoDecodeChoice: StackedDecode? = null
        private set
    @Volatile var autoDecodeScores: String = ""
        private set
    private var framesSinceAuto = 0

    private var intensityBuf = IntArray(0)
    private var colorBuf = IntArray(0)

    /** Evaluate the four candidate interpretations of a stacked YUY2 frame and pick the smoothest. */
    fun chooseStackedDecode(src: ByteArray, width: Int, imgH: Int): StackedDecode {
        val n = width * imgH
        val half = n * 2
        fun le16(off: Int): (Int) -> Int = { i -> (src[i * 2 + off].toInt() and 0xFF) or ((src[i * 2 + 1 + off].toInt() and 0xFF) shl 8) }
        fun luma(off: Int): (Int) -> Int = { i -> src[i * 2 + off].toInt() and 0xFF }
        val scores = linkedMapOf(
            StackedDecode.YUY2_TOP to PixelConverters.roughness(luma(0), width, imgH),
            StackedDecode.YUY2_BOTTOM to PixelConverters.roughness(luma(half), width, imgH),
            StackedDecode.RAW16_TOP to PixelConverters.roughness(le16(0), width, imgH),
            StackedDecode.RAW16_BOTTOM to PixelConverters.roughness(le16(half), width, imgH),
        )
        autoDecodeScores = scores.entries.joinToString(" ") { "${it.key.name}=%.3f".format(it.value) }
        return scores.minByOrNull { it.value }!!.key
    }

    fun process(
        src: ByteArray,
        length: Int,
        width: Int,
        height: Int,
        pixelFormat: UvcPixelFormat,
        sequence: Int,
        timestampMs: Long = System.currentTimeMillis(),
        monotonicNs: Long = System.nanoTime(),
        source: DataSource = DataSource.REAL,
    ): ThermalFrame? {
        if (width <= 0 || height <= 0) return null

        // Stacked detection: double-height frame with a 2-byte-per-pixel format.
        val stacked = when (stackedLayoutMode) {
            StackedLayoutMode.NEVER -> false
            StackedLayoutMode.ALWAYS -> height % 2 == 0
            StackedLayoutMode.AUTO -> height == expectedImageHeight * 2 && (pixelFormat == UvcPixelFormat.YUY2 || pixelFormat == UvcPixelFormat.UYVY || pixelFormat == UvcPixelFormat.Y16 || pixelFormat == UvcPixelFormat.UNKNOWN)
        }
        val imgH = if (stacked) height / 2 else height
        val n = width * imgH
        if (intensityBuf.size != n) { intensityBuf = IntArray(n); colorBuf = IntArray(n) }
        val intensity = IntArray(n)
        var color: IntArray? = null
        var hasChroma = false
        var bits = 8
        val range: IntRange

        var decodeInfo = pixelFormat.name
        var rawHalfOffset = if (stacked) n * 2 else -1 // where the 16-bit raw half starts (default: bottom)

        when (pixelFormat) {
            UvcPixelFormat.YUY2, UvcPixelFormat.UYVY -> {
                if (length < n * 2) return null
                val yFirst = pixelFormat == UvcPixelFormat.YUY2
                if (stacked && length >= n * 4) {
                    // Decide which half is the picture and whether it is 8-bit YUV or 16-bit samples.
                    var mode = stackedDecode
                    if (mode == StackedDecode.AUTO) {
                        if (autoDecodeChoice == null || framesSinceAuto >= 150) { autoDecodeChoice = chooseStackedDecode(src, width, imgH); framesSinceAuto = 0 }
                        framesSinceAuto++
                        mode = autoDecodeChoice!!
                    }
                    val topOff = 0; val botOff = n * 2
                    when (mode) {
                        StackedDecode.YUY2_TOP, StackedDecode.YUY2_BOTTOM -> {
                            val off = if (mode == StackedDecode.YUY2_TOP) topOff else botOff
                            range = PixelConverters.yuy2Luma(src, width, imgH, intensity, yFirst, off)
                            color = IntArray(n)
                            hasChroma = PixelConverters.yuy2ToArgb(src, width, imgH, color, yFirst, off)
                            if (!hasChroma) color = null
                            rawHalfOffset = if (mode == StackedDecode.YUY2_TOP) botOff else topOff
                            decodeInfo = "8-bit image (${if (mode == StackedDecode.YUY2_TOP) "top" else "bottom"} half)"
                        }
                        else -> {
                            val off = if (mode == StackedDecode.RAW16_TOP) topOff else botOff
                            bits = 16
                            range = PixelConverters.gray16(src, n, intensity, true, off)
                            rawHalfOffset = off
                            decodeInfo = "16-bit raw (${if (mode == StackedDecode.RAW16_TOP) "top" else "bottom"} half)"
                        }
                    }
                    if (stackedDecode == StackedDecode.AUTO) decodeInfo += " auto"
                } else {
                    range = PixelConverters.yuy2Luma(src, width, imgH, intensity, yFirst)
                    color = IntArray(n)
                    hasChroma = PixelConverters.yuy2ToArgb(src, width, imgH, color, yFirst)
                    if (!hasChroma) color = null
                }
            }
            UvcPixelFormat.Y16 -> {
                if (length < n * 2) return null
                bits = 16
                range = PixelConverters.gray16(src, n, intensity)
            }
            UvcPixelFormat.UNKNOWN -> {
                // Uncompressed 16 bpp with a vendor GUID: treat as 16-bit little-endian samples.
                if (length >= n * 2) { bits = 16; range = PixelConverters.gray16(src, n, intensity) }
                else if (length >= n) { range = PixelConverters.gray8(src, n, intensity) }
                else return null
            }
            UvcPixelFormat.Y8 -> {
                if (length < n) return null
                range = PixelConverters.gray8(src, n, intensity)
            }
            UvcPixelFormat.NV12 -> {
                if (length < n * 3 / 2) return null
                range = PixelConverters.planarLuma(src, n, intensity)
                color = IntArray(n)
                hasChroma = PixelConverters.nv12ToArgb(src, width, imgH, color)
                if (!hasChroma) color = null
            }
            UvcPixelFormat.I420 -> {
                if (length < n * 3 / 2) return null
                range = PixelConverters.planarLuma(src, n, intensity)
                color = IntArray(n)
                hasChroma = PixelConverters.i420ToArgb(src, width, imgH, color)
                if (!hasChroma) color = null
            }
            UvcPixelFormat.RGB24, UvcPixelFormat.BGR24 -> {
                if (length < n * 3) return null
                color = IntArray(n)
                PixelConverters.rgb24ToArgb(src, n, color, bgr = pixelFormat == UvcPixelFormat.BGR24)
                range = PixelConverters.argbLuma(color, intensity)
                hasChroma = true
            }
            UvcPixelFormat.MJPEG -> {
                val bmp = BitmapFactory.decodeByteArray(src, 0, length) ?: return null
                val bw = bmp.width; val bh = bmp.height
                if (bw <= 0 || bh <= 0) return null
                val argb = IntArray(bw * bh)
                bmp.getPixels(argb, 0, bw, 0, 0, bw, bh)
                bmp.recycle()
                val lum = IntArray(bw * bh)
                val r = PixelConverters.argbLuma(argb, lum)
                return ThermalFrame(Ids.frame(), timestampMs, monotonicNs, sequence, bw, bh, bw, bh, pixelFormat,
                    lum, 8, r.first, r.last, argb, true, null,
                    null, source, FrameLayout.SINGLE)
            }
            UvcPixelFormat.H264 -> return null
        }

        val lower: ByteArray? = if (stacked && rawHalfOffset >= 0) {
            val bpp = if (pixelFormat == UvcPixelFormat.Y8) 1 else 2
            if (length >= rawHalfOffset + n * bpp) src.copyOfRange(rawHalfOffset, rawHalfOffset + n * bpp) else null
        } else null

        val layout = if (stacked) FrameLayout.STACKED_IMAGE_RAW else FrameLayout.SINGLE
        val radiometric = runCatching { decoder.decode(width, imgH, pixelFormat, layout, intensity, lower) }.getOrNull()

        return ThermalFrame(
            Ids.frame(), timestampMs, monotonicNs, sequence, width, imgH, width, height, pixelFormat,
            intensity, bits, range.first, range.last, color, hasChroma, lower, radiometric, source, layout, decodeInfo,
        )
    }

    companion object {
        fun toBitmap(argb: IntArray, width: Int, height: Int, reuse: Bitmap? = null): Bitmap {
            val bmp = if (reuse != null && reuse.width == width && reuse.height == height && reuse.isMutable) reuse
            else Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bmp.setPixels(argb, 0, width, 0, 0, width, height)
            return bmp
        }
    }
}
