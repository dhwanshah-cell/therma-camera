# Architecture

## Modules

```
mobile (Android, Kotlin)                server (Node/TS)                 web (React/TS)
──────────────────────                  ────────────────                 ──────────────
UsbDeviceMonitor ─┐                     Fastify REST /api/*              pages: DASHBOARD LIVE THERMAL
UvcDescriptorParser│                     WebSocket hub /ws                       SENSORS ALERTS MAP 3D MAP
UvcCamera + JNI ───┤ frames             SQLite (better-sqlite3)                 STORAGE MISSIONS ROBOT
ThermalFrameProcessor                   media/ on filesystem                    SETTINGS
ThermalRenderer/palettes                simulation/ (labelled)           zustand stores ← ws client
ThermalCapture / VideoRecorder          services/ingest (dedupe by id)   three.js 3D viewer
Esp32Monitor ─────► AlertEngine
ImuRecorder ──────► PoseSourceRegistry ──► MissionRecorder ──► ThermalMapBuilder ──► MapExporter
RgbCameraController (CameraX)           shared (TS): types, zod schemas, ws framing, constants
MissionManager · Room DB · SyncQueue/SyncRunner/SyncWorker · LiveStreamer
```

## Identity and idempotency

Every record has a client-generated id (`sensor_<uuid>`, `alert_<uuid>`, `thermal_<uuid>`, …). The phone
stores the record locally, enqueues a sync envelope, and the server inserts with "ignore if exists". A
re-upload after a lost acknowledgement is reported as `duplicate` and treated as success, so nothing is
uploaded twice.

## Offline-first sync

```
record ─► Room table ─► sync_queue row (payload JSON + optional file URI)
                              │
             WorkManager (network constraint, periodic 15 min + on demand)
                              ▼
            POST /api/sync (batches of 100) ─► accepted/duplicates/rejected
                              ▼
            multipart POST /api/<kind>/<id>/file for images/videos
```

## Live path

Phone → `/ws` (role `phone`): binary frames `[u32 header length][JSON header][JPEG]` for `thermal` (≤ 8 fps)
and `rgb` (≤ 4 fps), JSON `sensor`/`alert`/`robot`/`mission`. Server caches the last frame per channel and
relays to subscribed web clients; web may send `command` messages (capture/record) that the server forwards
to the phone.

## Alerts

`AlertEngine` (pure Kotlin): GAS_ALERT on rising edge of `gas_alert`; THERMAL_HOTSPOT only with radiometric
data above a °C threshold; THERMAL_INTENSITY_HOTSPOT when a small fraction of the frame exceeds an
intensity threshold (explicitly "no temperature data"); ESP32_DISCONNECTED / THERMAL_CAMERA_DISCONNECTED on
falling edges; HUMAN_DETECTED / LOW_BATTERY / ROBOT_CONNECTION_LOST reserved for future sources. Every alert:
id, type, severity, timestamp, message, metadata, missionId, position (nullable), source.

## Frame association

Thermal frames, RGB frames, IMU samples and sensor readings carry wall-clock and monotonic timestamps plus
frame ids. `FrameAssociation` pairs nearest neighbours within a window. `CameraCalibration` stores thermal
and RGB positions on the robot, relative rotation (quaternion), translation and FOV, and is marked
`calibrated=false` until a real procedure fills it — the cameras are not assumed aligned.

## Mapping

`PoseSource` (IMU dead reckoning today; visual-inertial, robot odometry, LiDAR SLAM, GPS pluggable) and
`DepthSource` (LiDAR/depth camera pluggable; none available) feed `ThermalMapBuilder`. Each sampled frame
is reduced to a grid of cells → `ThermalPoint{x,y,z?,thermalIntensity,temperature?,timestamp,frameId}`.
Without a pose, points stay in image space (2D). With a pose, cells are projected as a planar footprint
along the trajectory (2D). Only with depth do points get `z` and the map becomes 3D. Maps are exported as
JSON (+ a rasterised JPG) under `RoboDog/Thermal/Maps` and uploaded to `POST /api/maps`.

## Human detection

`HumanDetector` interface (`detect(rgbBitmap, timestamp) → List<Detection>`); `NoHumanDetector` is the only
implementation and never emits detections. Wiring for association/alerts is in place; plug in a TFLite/
MediaPipe model by implementing the interface and registering it in `AppGraph`.
