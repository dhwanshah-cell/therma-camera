# RoboDog Android app

Kotlin · Jetpack Compose · Room · CameraX · WorkManager · native libusb + libuvc (NDK)

## Build & install

1. Install Android Studio (Ladybug 2024.2 or newer). In SDK Manager install **NDK 27.2.12479018** and
   **CMake 3.22.1** (the build downloads the rest).
2. Open the `mobile/` folder. Wait for Gradle sync.
3. Enable USB debugging on the phone, connect it, press **Run**.

Command line:

```bash
cd mobile
./gradlew assembleDebug            # APK at app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest        # JVM unit tests (no device needed)
./gradlew connectedDebugAndroidTest  # Room instrumentation tests (device/emulator needed)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Minimum Android 8.0 (API 26); target 15 (API 35). The phone must support USB host (OTG).

## First run

* Grant Camera and Notifications when asked. The app starts a foreground service so the pipeline
  keeps running with the screen off.
* Plug the **TC01A** into the phone's USB-C port. Android shows a USB permission dialog (tick "always
  open"). The THERMAL screen shows `🟢 CONNECTED` with the negotiated mode once frames arrive.
* Join Wi-Fi **ROBO-DOG** (password `robodog123`). The SENSORS screen shows `🟢 ESP32 CONNECTED` within
  a few seconds; polling is automatic.
* Settings → Backend: set the server URL to your laptop, e.g. `http://192.168.1.20:8080`, token
  `robodog-dev-token`. The phone needs a network route to the laptop (same Wi-Fi/hotspot). When it is
  offline everything is stored locally and synced later.

## Screens

HOME · THERMAL · CAMERA (RGB / THERMAL / DUAL VIEW) · SENSORS · MAP (2D / 3D) · STORAGE · SETTINGS · MISSIONS

## Reporting the camera's real format

THERMAL → **DIAGNOSTICS** prints the connection log and the parsed USB/UVC descriptors (formats, frame
sizes, frame rates, endpoint types). Copy that text into an issue so the stream decoder can be tuned
without guessing. `adb logcat -s RoboDogUVC UvcCamera UsbDeviceMonitor` shows the same from the shell.

## Layout

```
app/src/main/cpp/            robodog_uvc.cpp (JNI), vendored libusb (LGPL-2.1) and libuvc (BSD-3)
app/src/main/java/com/robodog/app/
  thermal/usb/               UsbDeviceMonitor, UvcDescriptorParser, UvcModeSelector, UsbDeviceMatcher
  thermal/uvc/               NativeUvc (JNI bindings), UvcCamera (open → negotiate → stream → frames)
  thermal/                   ThermalFrame, ThermalFrameProcessor, PixelConverters
  thermal/palette/           palettes + renderer (AGC)
  thermal/radiometric/       opt-in temperature decoders (all experimental, off by default)
  thermal/capture/           JPEG capture (MediaStore) and H.264 video recorder (MediaCodec)
  thermal/sim/               clearly-labelled simulator
  esp32/                     ESP32 client/parser/monitor (1 Hz polling, Wi-Fi binding)
  alerts/                    AlertEngine (gas, hotspot, connection alerts)
  rgb/                       CameraX controller, calibration store, frame association
  imu/                       IMU recorder
  mapping/                   pose/depth source interfaces, IMU dead-reckoning, map builder, exporter
  mission/                   MissionManager
  sync/                      BackendClient, SyncQueue/SyncRunner, SyncWorker, LiveStreamer
  detection/                 HumanDetector interface (no model bundled)
  robot/                     RobotStatusProvider (body controller link interface)
  data/                      Room entities/DAOs/database, settings (DataStore)
  ui/                        Compose screens
app/src/test/                JVM unit tests
app/src/androidTest/         Room instrumentation test
```
