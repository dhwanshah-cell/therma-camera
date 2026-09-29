package com.robodog.app.thermal.uvc

import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.util.Log
import com.robodog.app.core.DataSource
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.usb.UsbDeviceMonitor
import com.robodog.app.thermal.usb.UvcDescriptorParser
import com.robodog.app.thermal.usb.UvcDeviceDescription
import com.robodog.app.thermal.usb.UvcModeSelector
import com.robodog.app.thermal.usb.UvcPixelFormat
import com.robodog.app.thermal.usb.UvcStreamMode
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Drives the TC01A end-to-end: USB open → descriptor inspection → UVC negotiation →
 * streaming → decoded [ThermalFrame]s.
 *
 * Only real frames from the device are published here. Simulation lives in
 * [com.robodog.app.thermal.sim.ThermalSimulator] and is never routed through this class.
 */
class UvcCamera(
    private val monitor: UsbDeviceMonitor,
    val processor: ThermalFrameProcessor,
) {
    companion object {
        private const val TAG = "UvcCamera"
        private const val FRAME_TIMEOUT_US = 1_000_000
        /** Give up on a negotiated mode if no frame arrives within this time and try the next candidate. */
        private const val NO_FRAME_FALLBACK_MS = 4_000L
        private const val MAX_FALLBACK_MODES = 4
        private const val UVC_ERROR_BUSY = -6
    }

    sealed class State {
        data object Idle : State()
        data object Opening : State()
        data class Streaming(val mode: UvcStreamMode, val info: StreamInfo) : State()
        data class Error(val message: String, val detail: String? = null) : State()
    }

    data class StreamInfo(
        val isochronous: Boolean,
        val maxVideoFrameSize: Long,
        val maxPayloadTransferSize: Long,
        val libuvcFormat: String,
        val interfaceNumber: Int,
    )

    data class Stats(val fps: Double = 0.0, val frames: Long = 0, val timeouts: Long = 0, val lastSequence: Int = 0, val lastFrameAgeMs: Long = -1)

    private val _state = MutableStateFlow<State>(State.Idle)
    val state: StateFlow<State> = _state.asStateFlow()

    private val _description = MutableStateFlow<UvcDeviceDescription?>(null)
    val description: StateFlow<UvcDeviceDescription?> = _description.asStateFlow()

    private val _nativeDescription = MutableStateFlow<String?>(null)
    val nativeDescription: StateFlow<String?> = _nativeDescription.asStateFlow()

    private val _latestFrame = MutableStateFlow<ThermalFrame?>(null)
    val latestFrame: StateFlow<ThermalFrame?> = _latestFrame.asStateFlow()

    private val _frames = MutableSharedFlow<ThermalFrame>(replay = 0, extraBufferCapacity = 2)
    val frames: SharedFlow<ThermalFrame> = _frames.asSharedFlow()

    private val _stats = MutableStateFlow(Stats())
    val stats: StateFlow<Stats> = _stats.asStateFlow()

    private val _log = MutableStateFlow<List<String>>(emptyList())
    /** Human-readable connection log for the THERMAL screen diagnostics panel. */
    val log: StateFlow<List<String>> = _log.asStateFlow()

    var forcedFormatIndex: Int? = null
    var forcedFrameIndex: Int? = null

    private var connection: UsbDeviceConnection? = null
    private var ctxHandle = 0L
    private var devHandle = 0L
    private var streamHandle = 0L
    private var thread: Thread? = null
    private val running = AtomicBoolean(false)
    @Volatile private var currentDevice: UsbDevice? = null

    val isStreaming: Boolean get() = _state.value is State.Streaming

    private fun log(msg: String) {
        Log.i(TAG, msg)
        _log.value = (_log.value + "${java.time.LocalTime.now().withNano(0)} $msg").takeLast(120)
    }

    /** Pull libusb's own log lines into the visible connection log. */
    private fun drainNativeLog() {
        runCatching { NativeUvc.nativeLastLog() }.getOrNull()?.lines()?.filter { it.isNotBlank() }?.forEach { log("  $it") }
    }

    private val starting = AtomicBoolean(false)

    /** Open the device and start streaming. Must be called with USB permission already granted. */
    fun start(device: UsbDevice): Boolean {
        if (running.get()) return true
        if (!starting.compareAndSet(false, true)) return true
        try {
            return startInternal(device)
        } finally {
            starting.set(false)
        }
    }

    private fun startInternal(device: UsbDevice): Boolean {
        // Never hold two sessions: a leftover connection keeps the interfaces claimed → "Busy".
        if (connection != null || thread != null) stop()
        _state.value = State.Opening
        _log.value = emptyList()
        log("Opening ${monitor.describe(device)}")

        if (!NativeUvc.ensureLoaded()) {
            fail("Native UVC library failed to load", NativeUvc.loadError); return false
        }
        var conn = monitor.openDevice(device)
        if (conn == null) { fail("UsbManager.openDevice returned null (permission?)"); return false }
        connection = conn
        currentDevice = device

        // 1. Inspect descriptors ourselves (pure Kotlin) so the UI can show exactly what the camera advertises.
        val raw = conn.rawDescriptors
        val desc = if (raw != null) UvcDescriptorParser.parse(raw) else null
        _description.value = desc
        if (desc == null) { fail("Could not read USB descriptors"); return false }
        log("Descriptors: ${desc.streamingInterfaces.sumOf { it.formats.size }} format(s), ${desc.allFrames().size} frame size(s), UVC=${desc.isUvc}")
        desc.warnings.forEach { log("descriptor warning: $it") }
        if (!desc.isUvc) { fail("Device has no UVC VideoControl interface", desc.dump()); return false }
        if (!desc.hasStreaming) { fail("Device advertises no video formats", desc.dump()); return false }

        // 2. Hand the fd to libusb/libuvc.
        ctxHandle = NativeUvc.nativeInit()
        drainNativeLog()
        if (ctxHandle <= 0) { fail("libusb/libuvc init failed (${ctxHandle})", NativeUvc.nativeStrError(ctxHandle.toInt())); return false }
        log(NativeUvc.nativeVersion())
        devHandle = NativeUvc.nativeOpen(ctxHandle, conn.fileDescriptor)
        drainNativeLog()
        if (devHandle.toInt() == UVC_ERROR_BUSY) {
            // The interface is claimed by another open handle: a stale one of ours, or another app
            // (e.g. the Fluke iSee app auto-opening the camera). Reopen once after a short pause.
            log("Interface busy; closing our handle and retrying in 1 s")
            runCatching { conn.close() }
            Thread.sleep(1000)
            conn = monitor.openDevice(device)
            if (conn == null) { fail("UsbManager.openDevice returned null on retry"); return false }
            connection = conn
            devHandle = NativeUvc.nativeOpen(ctxHandle, conn.fileDescriptor)
            drainNativeLog()
        }
        if (devHandle.toInt() == UVC_ERROR_BUSY) {
            fail("Camera is busy: another app has it open", "Close the Fluke iSee app (and any USB camera app), unplug the camera, plug it back in and choose RoboDog. fd=${conn.fileDescriptor}")
            return false
        }
        if (devHandle <= 0) { fail("uvc_wrap failed: ${NativeUvc.nativeStrError(devHandle.toInt())}", "fd=${conn.fileDescriptor}"); return false }
        _nativeDescription.value = NativeUvc.nativeDescribe(devHandle)
        log("libuvc opened the device")

        // 3. Pick a mode from the real descriptors, with fallbacks if the first yields no frames.
        val candidates = candidateModes(desc)
        if (candidates.isEmpty()) { fail("No usable stream mode in descriptors", desc.dump()); return false }

        running.set(true)
        thread = Thread({ streamLoop(candidates) }, "uvc-stream").apply { priority = Thread.MAX_PRIORITY; start() }
        return true
    }

    private fun candidateModes(desc: UvcDeviceDescription): List<UvcStreamMode> {
        val pref = UvcModeSelector.Preference(forcedFormatIndex = forcedFormatIndex, forcedFrameIndex = forcedFrameIndex)
        val primary = UvcModeSelector.select(desc, pref) ?: return emptyList()
        val others = desc.allFrames()
            .filter { (f, fr) -> !(f.formatIndex == primary.format.formatIndex && fr.frameIndex == primary.frame.frameIndex) }
            .filter { (f, _) -> f.pixelFormat != UvcPixelFormat.H264 }
            .sortedByDescending { (f, fr) ->
                // Same ordering as the selector's preferences: native size first, then uncompressed before MJPEG.
                (if (fr.width == RoboDogConstants.TC01A_WIDTH) 100 else 0) + (if (f.pixelFormat != UvcPixelFormat.MJPEG) 50 else 0)
            }
            .map { (f, fr) -> UvcStreamMode(f, fr, UvcModeSelector.chooseInterval(fr), "fallback") }
        return listOf(primary) + others.take(MAX_FALLBACK_MODES)
    }

    private fun streamLoop(candidates: List<UvcStreamMode>) {
        var modeIndex = 0
        var buffer: ByteBuffer? = null
        val info = IntArray(6)
        var framesInWindow = 0
        var windowStart = System.currentTimeMillis()
        var totalFrames = 0L
        var timeouts = 0L
        var lastFrameAt = 0L
        var scratch = ByteArray(0)

        while (running.get() && modeIndex < candidates.size) {
            val mode = candidates[modeIndex]
            log("Trying mode ${modeIndex + 1}/${candidates.size}: $mode (${mode.reason})")
            val handle = NativeUvc.nativeStartStream(devHandle, mode.format.formatIndex, mode.frame.frameIndex, mode.frameInterval.toInt())
            drainNativeLog()
            if (handle <= 0) {
                log("Negotiation failed: ${NativeUvc.nativeStrError(handle.toInt())}")
                modeIndex++
                continue
            }
            streamHandle = handle
            val infoJson = NativeUvc.nativeStreamInfo(handle)
            val sInfo = parseStreamInfo(infoJson)
            log("Stream started: ${if (sInfo.isochronous) "isochronous" else "bulk"}, maxFrame=${sInfo.maxVideoFrameSize}, payload=${sInfo.maxPayloadTransferSize}, libuvc=${sInfo.libuvcFormat}")
            _state.value = State.Streaming(mode, sInfo)

            val cap = maxOf(sInfo.maxVideoFrameSize, (mode.frame.width.toLong() * mode.frame.height * 4), 256L * 1024).toInt()
            if (buffer == null || buffer.capacity() < cap) buffer = ByteBuffer.allocateDirect(cap)
            if (scratch.size < cap) scratch = ByteArray(cap)
            val started = System.currentTimeMillis()
            var gotFrameThisMode = false

            while (running.get()) {
                val n = NativeUvc.nativeGetFrame(handle, buffer, info, FRAME_TIMEOUT_US)
                if (n < 0) {
                    log("Frame read error: ${NativeUvc.nativeStrError(n)}")
                    drainNativeLog()
                    break
                }
                if (n == 0) {
                    timeouts++
                    val silentMs = System.currentTimeMillis() - (if (gotFrameThisMode) lastFrameAt else started)
                    _stats.value = _stats.value.copy(timeouts = timeouts, lastFrameAgeMs = silentMs)
                    if (!gotFrameThisMode && silentMs > NO_FRAME_FALLBACK_MS) {
                        log("No frames after ${silentMs} ms in this mode; trying next candidate")
                        break
                    }
                    continue
                }
                gotFrameThisMode = true
                lastFrameAt = System.currentTimeMillis()
                buffer.rewind()
                buffer.get(scratch, 0, n)
                val w = info[0]; val h = info[1]; val fmtOrd = info[2]; val seq = info[3]
                val pf = pixelFormatFor(fmtOrd, mode.format.pixelFormat)
                val frame = processor.process(scratch, n, w, h, pf, seq, source = DataSource.REAL)
                if (frame != null) {
                    _latestFrame.value = frame
                    _frames.tryEmit(frame)
                    totalFrames++
                    framesInWindow++
                    val now = System.currentTimeMillis()
                    if (now - windowStart >= 1000) {
                        _stats.value = Stats(framesInWindow * 1000.0 / (now - windowStart), totalFrames, timeouts, seq, 0)
                        framesInWindow = 0
                        windowStart = now
                    }
                } else if (totalFrames == 0L) {
                    log("Received $n bytes (${w}x${h}, libuvc fmt $fmtOrd) but could not decode as ${pf}")
                }
            }

            NativeUvc.nativeStopStream(handle)
            streamHandle = 0
            if (!running.get()) break
            if (gotFrameThisMode) {
                // Stream died after producing frames: report rather than silently cycling modes.
                fail("Thermal stream stopped after $totalFrames frames", "mode $mode")
                running.set(false)
                break
            }
            modeIndex++
        }
        if (running.get() && modeIndex >= candidates.size) {
            fail("Camera negotiated but never delivered a frame in ${candidates.size} mode(s)",
                "This is the same symptom as generic USB camera apps stuck on 'Connecting'. See the descriptor dump.")
            running.set(false)
        }
        releaseNative()
    }

    private fun pixelFormatFor(libuvcOrdinal: Int, negotiated: UvcPixelFormat): UvcPixelFormat = when (libuvcOrdinal) {
        NativeUvc.FrameFormat.YUYV -> UvcPixelFormat.YUY2
        NativeUvc.FrameFormat.UYVY -> UvcPixelFormat.UYVY
        NativeUvc.FrameFormat.GRAY8 -> UvcPixelFormat.Y8
        NativeUvc.FrameFormat.GRAY16 -> UvcPixelFormat.Y16
        NativeUvc.FrameFormat.MJPEG -> UvcPixelFormat.MJPEG
        NativeUvc.FrameFormat.NV12 -> UvcPixelFormat.NV12
        NativeUvc.FrameFormat.I420 -> UvcPixelFormat.I420
        NativeUvc.FrameFormat.RGB -> UvcPixelFormat.RGB24
        NativeUvc.FrameFormat.BGR -> UvcPixelFormat.BGR24
        else -> negotiated
    }

    private fun parseStreamInfo(json: String): StreamInfo {
        fun num(key: String): Long = Regex("\"$key\":(\\d+)").find(json)?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        fun str(key: String): String = Regex("\"$key\":\"([^\"]*)\"").find(json)?.groupValues?.get(1) ?: ""
        return StreamInfo(json.contains("\"isochronous\":true"), num("maxVideoFrameSize"), num("maxPayloadTransferSize"), str("frameFormat"), num("interface").toInt())
    }

    private fun fail(message: String, detail: String? = null) {
        log("ERROR: $message${detail?.let { " — $it" } ?: ""}")
        _state.value = State.Error(message, detail)
        releaseNative()
    }

    /**
     * Stops streaming. Not synchronized: the stream thread releases the native handles itself when
     * it exits, and it needs the lock for that, so we must not hold it while joining.
     */
    fun stop() {
        if (!running.get() && connection == null && thread == null) return
        log("Stopping stream")
        running.set(false)
        val t = thread
        t?.join(8000)
        thread = null
        if (t != null && t.isAlive) log("WARNING: stream thread did not stop in time")
        // Idempotent: the thread normally releases on exit; this covers the never-started case.
        releaseNative()
        _state.value = State.Idle
        _latestFrame.value = null
        _stats.value = Stats()
    }

    /** Called by the monitor when the device is unplugged. */
    fun onDetached(device: UsbDevice) {
        if (currentDevice?.deviceName == device.deviceName) {
            log("Device detached")
            stop()
            _state.value = State.Error("Thermal camera disconnected")
        }
    }

    @Synchronized
    private fun releaseNative() {
        if (streamHandle != 0L) { runCatching { NativeUvc.nativeStopStream(streamHandle) }; streamHandle = 0 }
        if (devHandle > 0) { runCatching { NativeUvc.nativeClose(devHandle) }; devHandle = 0 }
        if (ctxHandle > 0) { runCatching { NativeUvc.nativeExit(ctxHandle) }; ctxHandle = 0 }
        connection?.let { runCatching { it.close() } }
        connection = null
        currentDevice = null
    }
}
