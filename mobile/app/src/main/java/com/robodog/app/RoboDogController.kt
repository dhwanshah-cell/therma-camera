package com.robodog.app

import android.hardware.usb.UsbDevice
import android.util.Log
import com.robodog.app.core.DataSource
import com.robodog.app.core.RoboDogConstants
import com.robodog.app.data.model.Alert
import com.robodog.app.data.model.AlertType
import com.robodog.app.data.model.Mission
import com.robodog.app.data.model.MissionStatus
import com.robodog.app.data.model.Position
import com.robodog.app.data.model.RgbImage
import com.robodog.app.data.model.SensorReading
import com.robodog.app.data.model.ThermalImage
import com.robodog.app.data.model.ThermalMap
import com.robodog.app.data.model.VideoRecording
import com.robodog.app.data.settings.Settings
import com.robodog.app.esp32.Esp32Monitor
import com.robodog.app.mapping.ImuDeadReckoningPoseSource
import com.robodog.app.sync.SyncWorker
import com.robodog.app.thermal.ThermalFrame
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.palette.ThermalPalette
import com.robodog.app.thermal.radiometric.RadiometricDecoders
import com.robodog.app.thermal.usb.UsbDeviceMonitor
import com.robodog.app.thermal.uvc.UvcCamera
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Orchestrates the onboard pipeline:
 *
 *   TC01A / simulator ──► frames ──► UI, hotspot alerts, recorder, mapping, live stream
 *   ESP32 ──► readings ──► DB, gas alerts, live stream, sync queue
 *   IMU ──► pose source ──► mapping
 *   everything ──► local DB ──► sync queue ──► backend
 */
class RoboDogController(private val g: AppGraph) {
    companion object { private const val TAG = "RoboDogController" }

    private val scope = g.scope
    @Volatile var deviceId: String = ""
        private set
    @Volatile private var settings: Settings? = null

    /** Frames from whichever thermal source is active (real camera or clearly-labelled simulator). */
    private val _thermalFrame = MutableStateFlow<ThermalFrame?>(null)
    val thermalFrame: StateFlow<ThermalFrame?> = _thermalFrame.asStateFlow()

    private val _palette = MutableStateFlow(ThermalPalette.IRON)
    val palette: StateFlow<ThermalPalette> = _palette.asStateFlow()

    private val _recording = MutableStateFlow(false)
    val recording: StateFlow<Boolean> = _recording.asStateFlow()

    private val _lastCapture = MutableStateFlow<ThermalImage?>(null)
    val lastCapture: StateFlow<ThermalImage?> = _lastCapture.asStateFlow()

    private val _toast = MutableStateFlow<String?>(null)
    val toast: StateFlow<String?> = _toast.asStateFlow()
    fun consumeToast() { _toast.value = null }

    val esp32 = Esp32Monitor(g.esp32Client, scope, ::onSensorReading) { activeMissionId }
    @Volatile var activeMissionId: String? = null
        private set
    @Volatile private var activeMission: Mission? = null

    private val _thermalConnected = MutableStateFlow(false)
    val thermalConnected: StateFlow<Boolean> = _thermalConnected.asStateFlow()

    private var started = false
    private var simulationJob: Job? = null
    private var robotJob: Job? = null
    private var frameJob: Job? = null
    private var lastEsp32Connected: Boolean? = null
    private var lastThermalConnected: Boolean? = null

    fun start() {
        if (started) return
        started = true
        scope.launch {
            deviceId = g.settings.ensureDeviceId()
            g.usbMonitor.start()
            // Settings drive everything else; restart the affected subsystems whenever they change.
            g.settings.settings.collectLatest { s -> applySettings(s) }
        }
        scope.launch { g.missions.active.collectLatest { m -> activeMission = m; activeMissionId = m?.id; g.imu.setMission(m?.id) } }
        scope.launch { g.usbMonitor.state.collectLatest { onUsbState(it) } }
        scope.launch { g.uvcCamera.frames.collect { onThermalFrame(it) } }
        scope.launch { g.thermalSimulator.latestFrame.collect { f -> if (f != null) onThermalFrame(f) } }
        scope.launch { g.uvcCamera.state.collect { st -> onCameraState(st) } }
        scope.launch { g.liveStreamer.commands.collect { onRemoteCommand(it) } }
        scope.launch { g.rgbCamera.latestFrame.collect { f -> if (f != null && settings?.liveStreamingEnabled == true) g.liveStreamer.sendRgb(f.bitmap, f.frameId, f.timestampMs) } }
        g.imu.start(activeMissionId) { batch -> scope.launch { g.db.imu().insertAll(batch); if (activeMissionId != null) g.syncQueue.imuBatch(batch) } }
        scope.launch { g.imu.latest.collect { s -> if (s != null) (g.poseRegistry.allPose.firstOrNull { it is ImuDeadReckoningPoseSource } as? ImuDeadReckoningPoseSource)?.onSample(s) } }
        startRobotStatusLoop()
        scope.launch { runCatching { g.updater.check() } }
        Log.i(TAG, "controller started, device $deviceId")
    }

    private suspend fun applySettings(s: Settings) {
        val prev = settings
        settings = s
        _palette.value = ThermalPalette.fromName(s.palette)
        g.frameProcessor.decoder = RadiometricDecoders.byId(s.radiometricDecoderId)
        g.frameProcessor.stackedLayoutMode = runCatching { ThermalFrameProcessor.StackedLayoutMode.valueOf(s.stackedLayoutMode) }.getOrDefault(ThermalFrameProcessor.StackedLayoutMode.AUTO)
        g.frameProcessor.stackedDecode = runCatching { ThermalFrameProcessor.StackedDecode.valueOf(s.stackedDecode) }.getOrDefault(ThermalFrameProcessor.StackedDecode.AUTO)
        g.uvcCamera.forcedFormatIndex = s.forcedFormatIndex.takeIf { it > 0 }
        g.uvcCamera.forcedFrameIndex = s.forcedFrameIndex.takeIf { it > 0 }
        g.backend.baseUrl = s.serverUrl
        g.backend.token = s.apiToken

        if (prev == null || prev.esp32Url != s.esp32Url || prev.simulationMode != s.simulationMode || prev.bindToEsp32Wifi != s.bindToEsp32Wifi) {
            g.esp32Client.stop(); g.esp32Client.start(s.bindToEsp32Wifi && !s.simulationMode)
            esp32.start(s.esp32Url, s.simulationMode)
        }
        if (prev == null || prev.simulationMode != s.simulationMode) {
            if (s.simulationMode) {
                // Simulator only runs when no real camera is streaming; it never replaces real frames.
                if (!g.uvcCamera.isStreaming) g.thermalSimulator.start()
            } else g.thermalSimulator.stop()
        }
        if (prev == null || prev.serverUrl != s.serverUrl || prev.apiToken != s.apiToken || prev.liveStreamingEnabled != s.liveStreamingEnabled) {
            g.liveStreamer.disconnect()
            if (s.liveStreamingEnabled) g.liveStreamer.connect(s.serverUrl, s.apiToken)
        }
        if (prev == null || prev.autoStartCamera != s.autoStartCamera) onUsbState(g.usbMonitor.state.value)
        SyncWorker.syncNow(g.context)
    }

    // ---- thermal camera --------------------------------------------------------------------

    private fun onUsbState(st: UsbDeviceMonitor.State) {
        when (st) {
            is UsbDeviceMonitor.State.Detected -> {
                if (!st.hasPermission) {
                    // Ask once; after a denial wait for the user to tap RECONNECT (or replug the camera).
                    if (settings?.autoStartCamera != false && !g.usbMonitor.wasDenied(st.device)) g.usbMonitor.requestPermission(st.device)
                } else if (!g.uvcCamera.isStreaming && g.uvcCamera.state.value !is UvcCamera.State.Opening && settings?.autoStartCamera != false) {
                    startCamera(st.device)
                }
            }
            is UsbDeviceMonitor.State.NoDevice -> {
                if (g.uvcCamera.isStreaming || g.uvcCamera.state.value is UvcCamera.State.Opening) {
                    g.uvcCamera.stop()
                }
                _thermalConnected.value = false
                if (settings?.simulationMode == true) g.thermalSimulator.start()
            }
            is UsbDeviceMonitor.State.PermissionDenied -> _toast.value = "USB permission denied for the thermal camera"
        }
    }

    fun startCamera(device: UsbDevice) {
        g.thermalSimulator.stop()
        scope.launch(Dispatchers.IO) { g.uvcCamera.start(device) }
    }

    fun requestCameraPermission() { (g.usbMonitor.state.value as? UsbDeviceMonitor.State.Detected)?.let { g.usbMonitor.requestPermission(it.device, force = true) } }

    fun restartCamera() {
        g.uvcCamera.stop()
        g.usbMonitor.refresh()
        when (val st = g.usbMonitor.state.value) {
            is UsbDeviceMonitor.State.Detected -> if (st.hasPermission) startCamera(st.device) else g.usbMonitor.requestPermission(st.device, force = true)
            is UsbDeviceMonitor.State.PermissionDenied -> g.usbMonitor.requestPermission(st.device, force = true)
            UsbDeviceMonitor.State.NoDevice -> _toast.value = "No USB camera detected. Check the OTG cable."
        }
    }

    private fun onCameraState(st: UvcCamera.State) {
        val connected = st is UvcCamera.State.Streaming
        _thermalConnected.value = connected
        if (lastThermalConnected == true && !connected) {
            scope.launch { raiseAlert(g.alertEngine.connectionAlert(AlertType.THERMAL_CAMERA_DISCONNECTED, "Thermal camera disconnected", activeMissionId)) }
            if (settings?.simulationMode == true) g.thermalSimulator.start()
        }
        lastThermalConnected = connected
        if (st is UvcCamera.State.Error) _toast.value = st.message
    }

    private var hotspotCheckMs = 0L
    private suspend fun onThermalFrame(frame: ThermalFrame) {
        _thermalFrame.value = frame
        val s = settings ?: return
        if (g.thermalVideo.isRecording) g.thermalVideo.encode(frame)
        g.missionRecorder.onFrame(frame)
        if (s.liveStreamingEnabled) g.liveStreamer.sendThermal(frame, _palette.value)
        val now = System.currentTimeMillis()
        if (s.hotspotAlertsEnabled && now - hotspotCheckMs > 1000) {
            hotspotCheckMs = now
            val alert = g.alertEngine.onThermalFrame(frame, s.temperatureHotspotC, s.intensityHotspotThreshold, activeMissionId, currentPosition())
            raiseAlert(alert)
        }
    }

    fun currentPosition(): Position? = g.poseRegistry.bestPose().latestPose.value?.position

    fun setPalette(p: ThermalPalette) { _palette.value = p; scope.launch { g.settings.update { copy(palette = p.name) } } }

    // ---- capture / record --------------------------------------------------------------------

    fun captureThermal() {
        val frame = _thermalFrame.value ?: run { _toast.value = "No thermal frame to capture"; return }
        scope.launch(Dispatchers.IO) {
            runCatching {
                val img = g.thermalCapture.capture(frame, _palette.value, activeMissionId, currentPosition())
                g.db.thermalImages().upsert(img)
                g.syncQueue.thermalImage(img)
                _lastCapture.value = img
                _toast.value = "Saved ${img.fileName}"
                SyncWorker.syncNow(g.context)
            }.onFailure { _toast.value = "Capture failed: ${it.message}"; Log.e(TAG, "capture", it) }
        }
    }

    fun toggleThermalRecording() {
        if (g.thermalVideo.isRecording) {
            scope.launch(Dispatchers.IO) {
                val rec = g.thermalVideo.stop()
                _recording.value = false
                if (rec != null) { g.db.videos().upsert(rec); g.syncQueue.video(rec); _toast.value = "Saved ${rec.fileName}"; SyncWorker.syncNow(g.context) }
            }
        } else {
            val frame = _thermalFrame.value ?: run { _toast.value = "No thermal frame to record"; return }
            scope.launch(Dispatchers.IO) {
                runCatching {
                    val fps = (g.uvcCamera.state.value as? UvcCamera.State.Streaming)?.mode?.fps?.toInt() ?: 12
                    g.thermalVideo.start(frame, _palette.value, activeMissionId, fps)
                    _recording.value = true
                }.onFailure { _toast.value = "Recording failed: ${it.message}"; Log.e(TAG, "record", it) }
            }
        }
    }

    fun captureRgb() {
        val thermalId = _lastCapture.value?.takeIf { System.currentTimeMillis() - com.robodog.app.core.TimeFormat.epochMs(it.timestamp) < 5000 }?.id
        g.rgbCamera.capture(activeMissionId, currentPosition(), thermalId) { result ->
            result.onSuccess { img -> scope.launch { g.db.rgbImages().upsert(img); g.syncQueue.rgbImage(img); _toast.value = "Saved ${img.fileName}"; SyncWorker.syncNow(g.context) } }
                .onFailure { _toast.value = "RGB capture failed: ${it.message}" }
        }
    }

    fun toggleRgbRecording() {
        if (g.rgbCamera.recording.value) g.rgbCamera.stopRecording()
        else g.rgbCamera.startRecording(activeMissionId) { rec -> if (rec != null) scope.launch { g.db.videos().upsert(rec); g.syncQueue.video(rec); _toast.value = "Saved ${rec.fileName}" } }
    }

    private fun onRemoteCommand(cmd: String) {
        Log.i(TAG, "remote command: $cmd")
        when (cmd) {
            "capture_thermal" -> captureThermal()
            "capture_rgb" -> captureRgb()
            "start_recording" -> if (!g.thermalVideo.isRecording) toggleThermalRecording()
            "stop_recording" -> if (g.thermalVideo.isRecording) toggleThermalRecording()
        }
    }

    // ---- ESP32 / alerts ----------------------------------------------------------------------

    private suspend fun onSensorReading(r: SensorReading) {
        g.db.sensors().insert(r)
        g.missionRecorder.onSensor(r)
        g.liveStreamer.sendSensor(r)
        if (activeMissionId != null || r.gasAlert) g.syncQueue.sensor(r) else if (r.epochMs % 10_000 < 1000) g.syncQueue.sensor(r) // off-mission: sample ~1/10 to the backend
        raiseAlert(g.alertEngine.onSensorReading(r))
        val connected = esp32.state.value.connected
        if (lastEsp32Connected == true && !connected) raiseAlert(g.alertEngine.connectionAlert(AlertType.ESP32_DISCONNECTED, "ESP32 disconnected", activeMissionId))
        lastEsp32Connected = connected
    }

    suspend fun raiseAlert(a: Alert?) {
        if (a == null) return
        g.db.alerts().insert(a)
        g.syncQueue.alert(a)
        g.liveStreamer.sendAlert(a)
        _toast.value = a.message
        SyncWorker.syncNow(g.context)
    }

    fun acknowledgeAlert(a: Alert) { scope.launch { g.db.alerts().update(a.copy(acknowledged = true)) } }

    // ---- missions / mapping ------------------------------------------------------------------

    fun startMission(name: String? = null) { scope.launch { g.missions.start(name, if (settings?.simulationMode == true) DataSource.SIMULATION else DataSource.REAL); g.alertEngine.reset() } }
    fun endMission() { scope.launch { activeMissionId?.let { g.missions.end(it, MissionStatus.COMPLETED) } } }

    suspend fun onMissionChanged(m: Mission) {
        g.syncQueue.mission(m)
        g.liveStreamer.sendMission(m)
        if (m.status != MissionStatus.ACTIVE && g.missionRecorder.state.value.active) stopMapping()
        SyncWorker.syncNow(g.context)
    }

    fun startMapping() {
        scope.launch {
            if (activeMissionId == null) g.missions.start()
            val n = (g.db.missions().countMaps(activeMissionId ?: "")) + 1
            g.missionRecorder.start(activeMissionId, "Thermal map %03d".format(n), if (settings?.simulationMode == true) DataSource.SIMULATION else DataSource.REAL)
            _toast.value = "Thermal mapping started (${g.missionRecorder.state.value.poseSourceName})"
        }
    }

    fun stopMapping(): Boolean {
        val builder = g.missionRecorder.stop() ?: return false
        scope.launch(Dispatchers.IO) {
            if (builder.pointCount == 0) { _toast.value = "Mapping stopped: no frames were sampled"; return@launch }
            runCatching {
                val payload = builder.payload(null)
                val exported = g.mapExporter.export(payload, _palette.value)
                val meta = builder.metadata(exported.jsonUri)
                g.db.maps().upsert(meta)
                g.syncQueue.map(payload.copy(filePath = exported.jsonUri))
                _toast.value = "Map saved: ${meta.pointCount} points (${meta.dimension})"
                SyncWorker.syncNow(g.context)
            }.onFailure { _toast.value = "Map export failed: ${it.message}"; Log.e(TAG, "map", it) }
        }
        return true
    }

    // ---- robot status ------------------------------------------------------------------------

    private fun startRobotStatusLoop() {
        robotJob?.cancel()
        robotJob = scope.launch {
            while (isActive) {
                val s = settings
                if (s != null) {
                    val status = g.robotStatus.snapshot(esp32.state.value.connected, _thermalConnected.value, g.imu.availability.usable, g.poseRegistry.bestDepth() != null, activeMissionId, s.simulationMode)
                    g.db.robot().insert(status)
                    g.liveStreamer.sendRobot(status)
                    if (activeMissionId != null) g.syncQueue.robot(status)
                }
                delay(5000)
            }
        }
    }

    fun syncNow() = SyncWorker.syncNow(g.context)

    suspend fun deleteThermalImage(img: ThermalImage) = withContext(Dispatchers.IO) { g.storage.delete(android.net.Uri.parse(img.filePath)); g.db.thermalImages().delete(img.id) }
    suspend fun deleteRgbImage(img: RgbImage) = withContext(Dispatchers.IO) { g.storage.delete(android.net.Uri.parse(img.filePath)); g.db.rgbImages().delete(img.id) }
    suspend fun deleteVideo(v: VideoRecording) = withContext(Dispatchers.IO) { g.storage.delete(android.net.Uri.parse(v.filePath)); g.db.videos().delete(v.id) }
    suspend fun deleteMap(m: ThermalMap) = withContext(Dispatchers.IO) { m.filePath?.let { g.storage.delete(android.net.Uri.parse(it)) }; g.db.maps().delete(m.id) }
}
