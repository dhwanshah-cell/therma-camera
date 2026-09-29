# RoboDog — search-and-rescue hexapod software

Monorepo for the RoboDog project: an Android phone mounted on a six-legged robot is the onboard
computer. It streams the **Fluke iSee TC01A** thermal camera over USB-C OTG (USB Video Class, no
Camera2/CameraX), polls the **ESP32** sensor board (DHT11 + MQ gas), stores everything locally, and
syncs to a backend that feeds the **RoboDog Command Center** web dashboard.

```
robodog/
├── mobile/   Android app "RoboDog" (Kotlin, Jetpack Compose, Room, CameraX, native libusb+libuvc)
├── server/   Backend API (Node.js 22, TypeScript, Fastify, SQLite, WebSocket)
├── web/      RoboDog Command Center (React, TypeScript, Vite, Tailwind, three.js)
├── shared/   Shared data models, zod schemas, WebSocket protocol, constants
├── docs/     Architecture, hardware, TC01A/UVC notes, development guide
└── README.md
```

Data flow:

```
TC01A ──USB-C OTG / UVC──┐
Phone RGB camera ────────┤
Phone IMU ───────────────┤──► ANDROID APP ──► LOCAL DB (Room) ──► SYNC QUEUE ──► BACKEND ──► WEB DASHBOARD
ESP32 (Wi-Fi AP) ─HTTP───┘                 └──► live WebSocket (thermal/RGB JPEG, sensors, alerts) ──┘
```

## Accuracy rules baked into the code

* Values that are not measured are `null` in storage and `--` / "Unavailable" in every UI.
* Temperatures are only shown when a radiometric decoder actually produced them (`radiometric: true`);
  otherwise the app says **"Thermal image available — Radiometric temperature unavailable"**.
  No decoder is enabled by default; the shared schema rejects temperatures on non-radiometric records.
* The MQ gas value is a raw ADC count. It is never labelled ppm.
* Simulation mode data always carries `source: "SIMULATION"` and an amber **SIMULATION MODE** badge.
  The real TC01A driver path is separate from the simulator and never mixed with it.
* 3D thermal mapping is only rendered when a depth/pose source supplies real geometry; otherwise the
  viewers say "3D reconstruction requires a depth/pose source." / "Waiting for depth/pose data."

## Fastest way to run it

* **Phone app**: open https://github.com/dhwanshah-cell/therma-camera/releases/tag/latest-apk on the phone,
  download `robodog.apk`, tap it, allow the install. GitHub rebuilds it on every push.
* **Laptop dashboard (Windows)**: double-click `start-robodog.cmd` (or `start-robodog-simulation.cmd` for
  labelled fake data). Needs Node.js installed once. macOS/Linux: `./start-robodog.sh`.
* **Install over USB instead**: `install-app.cmd` downloads adb and the APK and installs it (USB debugging on).

## Quick start (development)

Requirements: Node.js ≥ 20, Android Studio (Ladybug or newer) with NDK 27 and CMake 3.22 for the app.

```bash
npm install                      # installs shared, server and web (npm workspaces)
npm run build -w shared          # shared types/schemas used by server and web

# Backend (port 8080). Add ROBODOG_SIMULATION=true to get labelled fake data without hardware.
ROBODOG_SIMULATION=true npm run dev -w server

# Web dashboard (port 5173, proxies /api, /ws, /media to the backend)
npm run dev -w web
```

Open http://localhost:5173 — the dev API token is `robodog-dev-token` (change with `ROBODOG_API_TOKEN`
on the server and in the web/app Settings pages).

Android app: open `mobile/` in Android Studio, let it sync, then **Run** on a phone (USB host / OTG
capable). Or from a terminal: `cd mobile && ./gradlew assembleDebug` and install
`app/build/outputs/apk/debug/app-debug.apk`. See `mobile/README.md`.

Tests:

```bash
npm test                         # shared + server + web (vitest)
cd mobile && ./gradlew testDebugUnitTest   # Android JVM unit tests
```

## How the pieces connect

| Link | Mechanism |
| --- | --- |
| TC01A → phone | USB host. VID `0x0F7E` PID `0x00BC` (see `mobile/app/src/main/res/xml/device_filter.xml`). The app parses the raw UVC descriptors in Kotlin, then hands the usbfs file descriptor to a native libusb + libuvc driver that negotiates the stream (bulk or isochronous) and returns frames. |
| ESP32 → phone | Phone joins Wi-Fi `ROBO-DOG` (password `robodog123` by default). The app binds HTTP to the Wi-Fi network and polls `http://192.168.4.1/api/sensors` every second. |
| Phone → backend | REST (`POST /api/sync`, multipart file uploads) driven by a Room-backed offline queue and WorkManager; plus a WebSocket (`/ws`, role `phone`) for live JPEG frames, sensor readings, alerts, robot status and missions. |
| Backend → web | REST (`/api/*`) plus the same WebSocket (role `web`). Media served from `/media/...`. |

## Storage on the phone

```
Pictures/RoboDog/Thermal/Images/thermal_YYYYMMDD_HHMMSS.jpg
Movies/RoboDog/Thermal/Videos/thermal_video_YYYYMMDD_HHMMSS.mp4
Documents/RoboDog/Thermal/Maps/thermal_map_YYYYMMDD_HHMMSS.{json,jpg}
Pictures/RoboDog/RGB/Images/rgb_YYYYMMDD_HHMMSS.jpg
Movies/RoboDog/RGB/Videos/rgb_video_YYYYMMDD_HHMMSS.mp4
```

Files go through MediaStore, so they appear in the phone's gallery and survive without internet.
Metadata lives in the Room database `robodog.db`; on the server in `server/data/robodog.db` with media
under `server/media/`.

## Documentation

* `docs/ARCHITECTURE.md` — modules, data flow, sync, alert and mapping design
* `docs/TC01A_UVC.md` — how the thermal camera is detected, negotiated and decoded; how to report the descriptor dump
* `docs/HARDWARE.md` — ESP32 endpoint, Wi-Fi, phone requirements
* `docs/DEVELOPMENT.md` — running, testing, simulation mode, environment variables
* `docs/STATUS.md` — what works now, what needs hardware, what is simulated, what is prepared for LiDAR/depth
* `server/README.md`, `web/README.md`, `mobile/README.md`
