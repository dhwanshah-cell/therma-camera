package com.robodog.app.rgb

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.MediaStoreOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.robodog.app.core.DataSource
import com.robodog.app.core.Ids
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.core.TimeFormat
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.RgbImage
import com.robodog.app.data.model.VideoKind
import com.robodog.app.data.model.VideoRecording
import com.robodog.app.storage.MediaStorage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import android.content.ContentValues
import android.provider.MediaStore

/**
 * The phone's normal RGB camera through CameraX. Produces a preview, still captures saved
 * under RoboDog/RGB/Images, MP4 recordings under RoboDog/RGB/Videos, and a low-rate
 * analysis stream used for dual view, live streaming and the future human-detection module.
 */
class RgbCameraController(private val context: Context, private val storage: MediaStorage) {
    companion object { private const val TAG = "RgbCamera"; const val CAMERA_ID = "phone_back" }

    /** A downscaled RGB frame with timestamps for association with thermal frames. */
    class RgbFrame(val frameId: String, val timestampMs: Long, val monotonicNs: Long, val bitmap: Bitmap, val width: Int, val height: Int)

    private val _latestFrame = MutableStateFlow<RgbFrame?>(null)
    val latestFrame: StateFlow<RgbFrame?> = _latestFrame.asStateFlow()
    private val _active = MutableStateFlow(false)
    val active: StateFlow<Boolean> = _active.asStateFlow()
    private val _recording = MutableStateFlow(false)
    val recording: StateFlow<Boolean> = _recording.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private var provider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private var recordingStartMs = 0L
    private var recordingMissionId: String? = null
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private var lastAnalysisMs = 0L
    var analysisIntervalMs = 250L

    fun bind(owner: LifecycleOwner, surfaceProvider: Preview.SurfaceProvider?) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                val p = future.get()
                provider = p
                p.unbindAll()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(surfaceProvider) }
                val capture = ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
                val recorder = Recorder.Builder().setQualitySelector(QualitySelector.from(Quality.HD, androidx.camera.video.FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))).build()
                val video = VideoCapture.withOutput(recorder)
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                    .build().also { it.setAnalyzer(analysisExecutor, ::analyze) }
                val selector = CameraSelector.DEFAULT_BACK_CAMERA
                try {
                    p.bindToLifecycle(owner, selector, preview, capture, video, analysis)
                } catch (e: IllegalArgumentException) {
                    // Some devices cannot bind 4 use cases; drop video capture.
                    p.unbindAll(); videoCapture = null
                    p.bindToLifecycle(owner, selector, preview, capture, analysis)
                }
                imageCapture = capture
                videoCapture = video
                _active.value = true
                _error.value = null
            } catch (t: Throwable) {
                Log.e(TAG, "bind failed", t)
                _error.value = t.message ?: t.toString()
                _active.value = false
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun unbind() {
        runCatching { provider?.unbindAll() }
        _active.value = false
        _latestFrame.value = null
    }

    private fun analyze(image: ImageProxy) {
        val now = System.currentTimeMillis()
        if (now - lastAnalysisMs < analysisIntervalMs) { image.close(); return }
        lastAnalysisMs = now
        try {
            val bmp = toBitmap(image, maxWidth = 640) ?: return
            _latestFrame.value = RgbFrame(Ids.frame(), now, System.nanoTime(), bmp, bmp.width, bmp.height)
        } catch (t: Throwable) {
            Log.w(TAG, "analyze failed: $t")
        } finally { image.close() }
    }

    /** YUV_420_888 → NV21 → JPEG → Bitmap (downscaled and rotated to display orientation). */
    private fun toBitmap(image: ImageProxy, maxWidth: Int): Bitmap? {
        if (image.format != ImageFormat.YUV_420_888) return null
        val nv21 = yuv420ToNv21(image)
        val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
        val out = ByteArrayOutputStream()
        yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 80, out)
        val bytes = out.toByteArray()
        val sample = maxOf(1, image.width / maxWidth)
        val opts = BitmapFactory.Options().apply { inSampleSize = Integer.highestOneBit(sample) }
        var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
        val rot = image.imageInfo.rotationDegrees
        if (rot != 0) {
            val m = Matrix().apply { postRotate(rot.toFloat()) }
            val r = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            if (r !== bmp) bmp.recycle()
            bmp = r
        }
        return bmp
    }

    private fun yuv420ToNv21(image: ImageProxy): ByteArray {
        val w = image.width; val h = image.height
        val out = ByteArray(w * h * 3 / 2)
        val y = image.planes[0]; val u = image.planes[1]; val v = image.planes[2]
        var pos = 0
        val yBuf = y.buffer; val yRow = y.rowStride; val yPix = y.pixelStride
        for (row in 0 until h) { for (col in 0 until w) out[pos++] = yBuf.get(row * yRow + col * yPix) }
        val uBuf = u.buffer; val vBuf = v.buffer
        val cRow = u.rowStride; val cPix = u.pixelStride
        for (row in 0 until h / 2) for (col in 0 until w / 2) {
            val i = row * cRow + col * cPix
            out[pos++] = vBuf.get(i); out[pos++] = uBuf.get(i)
        }
        return out
    }

    fun capture(missionId: String?, position: Position?, associatedThermalImageId: String?, onResult: (Result<RgbImage>) -> Unit) {
        val ic = imageCapture ?: return onResult(Result.failure(IllegalStateException("RGB camera not bound")))
        val stamp = System.currentTimeMillis()
        val fileName = "rgb_${TimeFormat.fileStamp(stamp)}.jpg"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
            if (android.os.Build.VERSION.SDK_INT >= 29) put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/${RoboDogConstants.DIR_RGB_IMAGES}")
        }
        val options = ImageCapture.OutputFileOptions.Builder(context.contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values).build()
        ic.takePicture(options, ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                val uri = output.savedUri
                val size = uri?.let { storage.sizeOf(it) }
                val (w, h) = uri?.let { u -> runCatching {
                    val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    context.contentResolver.openInputStream(u)?.use { BitmapFactory.decodeStream(it, null, o) }
                    o.outWidth to o.outHeight
                }.getOrNull() } ?: (0 to 0)
                onResult(Result.success(RgbImage(
                    id = Ids.rgbImage(), timestamp = TimeFormat.iso(stamp), missionId = missionId, cameraId = CAMERA_ID,
                    width = w, height = h, fileName = fileName, filePath = uri?.toString() ?: "", associatedThermalImageId = associatedThermalImageId,
                    x = position?.x, y = position?.y, z = position?.z, positionFrame = position?.frame, source = DataSource.REAL, sizeBytes = size,
                )))
            }
            override fun onError(exception: ImageCaptureException) { onResult(Result.failure(exception)) }
        })
    }

    @android.annotation.SuppressLint("MissingPermission")
    fun startRecording(missionId: String?, onFinished: (VideoRecording?) -> Unit): Boolean {
        val vc = videoCapture ?: return false
        if (activeRecording != null) return true
        val fileName = "rgb_video_${TimeFormat.fileStamp()}.mp4"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
            if (android.os.Build.VERSION.SDK_INT >= 29) put(MediaStore.MediaColumns.RELATIVE_PATH, "Movies/${RoboDogConstants.DIR_RGB_VIDEOS}")
        }
        val opts = MediaStoreOutputOptions.Builder(context.contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI).setContentValues(values).build()
        recordingStartMs = System.currentTimeMillis()
        recordingMissionId = missionId
        activeRecording = vc.output.prepareRecording(context, opts).start(ContextCompat.getMainExecutor(context)) { event ->
            when (event) {
                is VideoRecordEvent.Start -> _recording.value = true
                is VideoRecordEvent.Finalize -> {
                    _recording.value = false
                    activeRecording = null
                    val uri = event.outputResults.outputUri
                    val end = System.currentTimeMillis()
                    onFinished(if (event.hasError()) null else VideoRecording(
                        id = Ids.video(), kind = VideoKind.RGB, timestamp = TimeFormat.iso(recordingStartMs), endTimestamp = TimeFormat.iso(end),
                        missionId = recordingMissionId, cameraModel = CAMERA_ID, width = 0, height = 0, fileName = fileName, filePath = uri.toString(),
                        durationMs = event.recordingStats.recordedDurationNanos / 1_000_000, frameCount = null, codec = "H.264/MP4",
                        palette = null, source = DataSource.REAL, sizeBytes = event.recordingStats.numBytesRecorded,
                    ))
                }
                else -> {}
            }
        }
        return true
    }

    fun stopRecording() { activeRecording?.stop() }
}
