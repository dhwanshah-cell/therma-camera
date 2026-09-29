# Project status

Last verified in a cloud build environment without the physical hardware. Everything marked
"needs hardware" was compiled and unit-tested but **not** exercised against the real device.

## Verified here

| Area | Evidence |
| --- | --- |
| Shared models & schemas | `npm test -w shared` — 9 tests |
| Backend REST, WebSocket, sync, media, simulation | `npm test -w server` — 50 tests; simulation server smoke test |
| Web dashboard | `npm test -w web` — 15 tests; production build; every page rendered in headless Chromium against the real backend in simulation mode |
| Phone ↔ backend protocol | scripted "phone" client: hello/presence, sensor relay to web, binary thermal frame relay, `POST /api/sync` + multipart file upload |
| Android app | Kotlin compiles; native libusb+libuvc driver compiles for arm64-v8a and armeabi-v7a; debug APK assembles; JVM unit tests (descriptor parser, mode selector, USB matcher, pixel converters, palettes, radiometric decoders, ESP32 parser + mock HTTP, alert engine, map builder, pose registry, frame association, metadata) |

## Needs the physical TC01A

* USB permission flow, descriptor dump from the real camera, UVC negotiation (bulk vs isochronous), frame delivery, format decode, live image, capture, video recording.
* Confirming whether the stream carries radiometric data and in which encoding (decoders are opt-in until confirmed).

## Needs the ESP32

* Live polling of `http://192.168.4.1/api/sensors`, Wi-Fi binding behaviour, real gas alerts. (Parser and client are tested against a local mock server.)

## Needs a phone / emulator

* Room instrumentation tests (`connectedDebugAndroidTest`), CameraX RGB camera, MediaStore writes, IMU, WorkManager sync, foreground service.

## Simulated when enabled

* Server: sensor readings, robot status, alerts, thermal JPEG frames, "SIMULATION MISSION".
* App: ESP32 readings, thermal frames, robot status (battery/motor/leg/SLAM strings prefixed `SIM:`).
* All of it labelled `SIMULATION`; the real TC01A path never emits simulated frames.

## Prepared for future hardware

* `PoseSource` / `DepthSource` / `PoseSourceRegistry` (LiDAR SLAM, visual-inertial, robot odometry, GPS, depth camera) — the map builder already consumes depth to produce `z`, and the 3D viewers (phone and web) render only when real geometry exists.
* `RobotLink` for the body controller (battery, motors, legs, movement, SLAM).
* `HumanDetector` interface with association + alert wiring; no model bundled.
* `CameraCalibration` structure for thermal-on-RGB overlay.
