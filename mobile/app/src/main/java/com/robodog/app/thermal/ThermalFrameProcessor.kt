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

    private var intensityBuf = IntArray(0)
    private var colorBuf = IntArray(0)

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

        when (pixelFormat) {
            UvcPixelFormat.YUY2, UvcPixelFormat.UYVY -> {
                if (length < n * 2) return null
                val yFirst = pixelFormat == UvcPixelFormat.YUY2
                range = PixelConverters.yuy2Luma(src, width, imgH, intensity, yFirst)
                color = IntArray(n)
                hasChroma = PixelConverters.yuy2ToArgb(src, width, imgH, color, yFirst)
                if (!hasChroma) color = null
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

        val lower: ByteArray? = if (stacked) {
            val bpp = if (pixelFormat == UvcPixelFormat.Y8) 1 else 2
            val start = n * bpp
            if (length >= start + n * bpp) src.copyOfRange(start, start + n * bpp) else null
        } else null

        val layout = if (stacked) FrameLayout.STACKED_IMAGE_RAW else FrameLayout.SINGLE
        val radiometric = runCatching { decoder.decode(width, imgH, pixelFormat, layout, intensity, lower) }.getOrNull()

        return ThermalFrame(
            Ids.frame(), timestampMs, monotonicNs, sequence, width, imgH, width, height, pixelFormat,
            intensity, bits, range.first, range.last, color, hasChroma, lower, radiometric, source, layout,
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
