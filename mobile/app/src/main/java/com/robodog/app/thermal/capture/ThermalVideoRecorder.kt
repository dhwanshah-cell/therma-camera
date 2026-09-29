package com.robodog.app.thermal.capture

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.os.ParcelFileDescriptor
import android.util.Log
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.VideoKind
import com.robodog.app.data.model.VideoRecording
import com.robodog.app.storage.MediaStorage
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.palette.ThermalRenderer
import java.io.FileDescriptor

/**
 * Encodes rendered thermal frames to H.264 in an MP4 container using MediaCodec + MediaMuxer.
 * Frames are 256x192 at up to 25 fps, so bitrate is kept small (~1.5 Mbit/s) — files stay tiny.
 * Colour conversion feeds the encoder's YUV420 (flexible) input surface-less path.
 */
class ThermalVideoRecorder(private val storage: MediaStorage) {
    companion object {
        private const val TAG = "ThermalVideoRecorder"
        private const val MIME = MediaFormat.MIMETYPE_VIDEO_AVC
        private const val BITRATE = 1_500_000
        private const val IFRAME_INTERVAL_S = 2
    }

    private var codec: MediaCodec? = null
    private var muxer: MediaMuxer? = null
    private var trackIndex = -1
    private var muxerStarted = false
    private var target: MediaStorage.VideoTarget? = null
    private var pfd: ParcelFileDescriptor? = null
    private var width = 0
    private var height = 0
    private var fps = 25
    private var frameCount = 0
    private var startMs = 0L
    private var firstPtsNs = -1L
    private var colorFormat = 0
    private var argb = IntArray(0)
    private var yuv = ByteArray(0)
    private val bufferInfo = MediaCodec.BufferInfo()
    private var missionId: String? = null
    private var palette = ThermalPalette.IRON
    private var source = com.robodog.app.core.DataSource.REAL
    private var lastFrameFormat: String = ""

    val isRecording: Boolean get() = codec != null
    val recordedFrames: Int get() = frameCount
    val elapsedMs: Long get() = if (startMs == 0L) 0 else System.currentTimeMillis() - startMs

    @Synchronized
    fun start(frame: ThermalFrame, palette: ThermalPalette, missionId: String?, fps: Int = RoboDogConstants.TC01A_NOMINAL_FPS) {
        if (codec != null) return
        // Encoders require even dimensions (and often 16-aligned); pad to a multiple of 16.
        width = (frame.width + 15) / 16 * 16
        height = (frame.height + 15) / 16 * 16
        this.fps = fps.coerceIn(5, 30)
        this.missionId = missionId
        this.palette = palette
        this.source = frame.source
        this.lastFrameFormat = frame.pixelFormat.name

        val format = MediaFormat.createVideoFormat(MIME, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
            setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
            setInteger(MediaFormat.KEY_FRAME_RATE, this@ThermalVideoRecorder.fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, IFRAME_INTERVAL_S)
        }
        val c = MediaCodec.createEncoderByType(MIME)
        c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        colorFormat = c.inputFormat.getInteger(MediaFormat.KEY_COLOR_FORMAT)
        c.start()
        codec = c

        val fileName = "thermal_video_${TimeFormat.fileStamp()}.mp4"
        val t = storage.createVideo(RoboDogConstants.DIR_THERMAL_VIDEOS, fileName)
        target = t
        muxer = if (t.fd >= 0) {
            pfd = ParcelFileDescriptor.adoptFd(t.fd)
            MediaMuxer(pfd!!.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        } else MediaMuxer(t.path!!, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        trackIndex = -1
        muxerStarted = false
        frameCount = 0
        firstPtsNs = -1
        startMs = System.currentTimeMillis()
        argb = IntArray(frame.pixelCount)
        yuv = ByteArray(width * height * 3 / 2)
        Log.i(TAG, "recording $fileName ${width}x${height} @ $fps fps, colorFormat=$colorFormat")
    }

    @Synchronized
    fun encode(frame: ThermalFrame) {
        val c = codec ?: return
        if (argb.size != frame.pixelCount) argb = IntArray(frame.pixelCount)
        ThermalRenderer.render(frame, palette, argb)
        argbToYuv420(argb, frame.width, frame.height)
        val ptsUs = if (firstPtsNs < 0) { firstPtsNs = frame.monotonicNs; 0L } else (frame.monotonicNs - firstPtsNs) / 1000
        val inIdx = c.dequeueInputBuffer(10_000)
        if (inIdx >= 0) {
            val buf = c.getInputBuffer(inIdx) ?: return
            buf.clear(); buf.put(yuv)
            c.queueInputBuffer(inIdx, 0, yuv.size, ptsUs, 0)
            frameCount++
        }
        drain(false)
    }

    @Synchronized
    fun stop(): VideoRecording? {
        val c = codec ?: return null
        runCatching {
            val inIdx = c.dequeueInputBuffer(10_000)
            if (inIdx >= 0) c.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            drain(true)
        }
        runCatching { c.stop(); c.release() }
        codec = null
        val m = muxer
        runCatching { if (muxerStarted) m?.stop(); m?.release() }
        muxer = null
        runCatching { pfd?.close() }; pfd = null
        val t = target ?: return null
        target = null
        t.finish()
        val endMs = System.currentTimeMillis()
        val rec = VideoRecording(
            id = Ids.video(), kind = VideoKind.THERMAL, timestamp = TimeFormat.iso(startMs), endTimestamp = TimeFormat.iso(endMs),
            missionId = missionId, cameraModel = if (source == com.robodog.app.core.DataSource.SIMULATION) "SIMULATION" else RoboDogConstants.TC01A_MODEL,
            width = width, height = height, fileName = t.fileName, filePath = t.uri.toString(), durationMs = endMs - startMs,
            frameCount = frameCount, codec = "H.264/MP4 ($lastFrameFormat source)", palette = palette.name, source = source,
            sizeBytes = storage.sizeOf(t.uri),
        )
        Log.i(TAG, "saved ${rec.fileName}: ${rec.frameCount} frames, ${rec.durationMs} ms, ${rec.sizeBytes} bytes")
        return rec
    }

    private fun drain(eos: Boolean) {
        val c = codec ?: return
        val m = muxer ?: return
        while (true) {
            val idx = c.dequeueOutputBuffer(bufferInfo, if (eos) 50_000 else 0)
            when {
                idx == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!eos) return else return
                idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    if (!muxerStarted) { trackIndex = m.addTrack(c.outputFormat); m.start(); muxerStarted = true }
                }
                idx >= 0 -> {
                    val out = c.getOutputBuffer(idx)
                    if (out != null && bufferInfo.size > 0 && muxerStarted && bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
                        out.position(bufferInfo.offset); out.limit(bufferInfo.offset + bufferInfo.size)
                        m.writeSampleData(trackIndex, out, bufferInfo)
                    }
                    c.releaseOutputBuffer(idx, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    /** ARGB → I420 or NV12 depending on the encoder's chosen colour format, with padding. */
    private fun argbToYuv420(src: IntArray, srcW: Int, srcH: Int) {
        val ySize = width * height
        val semiPlanar = colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
        java.util.Arrays.fill(yuv, 0, ySize, 16.toByte())
        java.util.Arrays.fill(yuv, ySize, yuv.size, 128.toByte())
        for (y in 0 until srcH) {
            for (x in 0 until srcW) {
                val p = src[y * srcW + x]
                val r = (p shr 16) and 0xFF; val g = (p shr 8) and 0xFF; val b = p and 0xFF
                val yy = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
                yuv[y * width + x] = yy.coerceIn(16, 235).toByte()
                if (y % 2 == 0 && x % 2 == 0) {
                    val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                    val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                    val cx = x / 2; val cy = y / 2
                    if (semiPlanar) {
                        val i = ySize + cy * width + cx * 2
                        yuv[i] = u.coerceIn(16, 240).toByte(); yuv[i + 1] = v.coerceIn(16, 240).toByte()
                    } else {
                        val cw = width / 2
                        yuv[ySize + cy * cw + cx] = u.coerceIn(16, 240).toByte()
                        yuv[ySize + ySize / 4 + cy * cw + cx] = v.coerceIn(16, 240).toByte()
                    }
                }
            }
        }
    }
}
