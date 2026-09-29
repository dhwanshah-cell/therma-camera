package com.robodog.app

import android.content.Context
import com.robodog.app.alerts.AlertEngine
import com.robodog.app.data.db.RoboDogDatabase
import com.robodog.app.data.settings.SettingsStore
import com.robodog.app.detection.HumanDetector
import com.robodog.app.detection.NoHumanDetector
import com.robodog.app.esp32.Esp32Client
import com.robodog.app.imu.ImuRecorder
import com.robodog.app.mapping.ImuDeadReckoningPoseSource
import com.robodog.app.mapping.LidarDepthSource
import com.robodog.app.mapping.MapExporter
import com.robodog.app.mapping.MissionRecorder
import com.robodog.app.mapping.PoseSourceRegistry
import com.robodog.app.mission.MissionManager
import com.robodog.app.rgb.CalibrationStore
import com.robodog.app.rgb.RgbCameraController
import com.robodog.app.robot.RobotStatusProvider
import com.robodog.app.storage.MediaStorage
import com.robodog.app.sync.BackendClient
import com.robodog.app.sync.LiveStreamer
import com.robodog.app.sync.SyncQueue
import com.robodog.app.sync.SyncRunner
import com.robodog.app.thermal.ThermalFrameProcessor
import com.robodog.app.thermal.capture.ThermalCapture
import com.robodog.app.thermal.capture.ThermalVideoRecorder
import com.robodog.app.thermal.sim.ThermalSimulator
import com.robodog.app.thermal.usb.UsbDeviceMonitor
import com.robodog.app.thermal.uvc.UvcCamera
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Hand-wired singletons (no DI framework needed for an on-robot app). */
class AppGraph(val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val db: RoboDogDatabase = RoboDogDatabase.build(context)
    val settings = SettingsStore(context)
    val storage = MediaStorage(context)

    val usbMonitor = UsbDeviceMonitor(context)
    val frameProcessor = ThermalFrameProcessor()
    val uvcCamera = UvcCamera(usbMonitor, frameProcessor)
    val thermalSimulator = ThermalSimulator(scope)
    val thermalCapture = ThermalCapture(storage)
    val thermalVideo = ThermalVideoRecorder(storage)

    val rgbCamera = RgbCameraController(context, storage)
    val calibration = CalibrationStore(context)
    val imu = ImuRecorder(context)
    val poseRegistry = PoseSourceRegistry().apply {
        registerPose(ImuDeadReckoningPoseSource())
        registerDepth(LidarDepthSource())
    }
    val missionRecorder = MissionRecorder(poseRegistry)
    val mapExporter = MapExporter(storage)

    val esp32Client = Esp32Client(context)
    val alertEngine = AlertEngine()
    val missions = MissionManager(db.missions()) { m -> controller.onMissionChanged(m) }
    val robotStatus = RobotStatusProvider()
    val humanDetector: HumanDetector = NoHumanDetector

    val backend = BackendClient(storage)
    val syncQueue = SyncQueue(db)
    val syncRunner = SyncRunner(db, syncQueue, backend)
    val liveStreamer = LiveStreamer { controller.deviceId }

    val controller = RoboDogController(this)
}
