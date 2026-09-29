# Development guide

## Prerequisites

* Node.js 20+ (22 recommended), npm 10+
* Android Studio with NDK 27.2.12479018 and CMake 3.22.1 (for `mobile/`)

## Commands (repo root)

| Command | What |
| --- | --- |
| `npm install` | install all workspaces |
| `npm run build -w shared` | build shared models (required once before server/web) |
| `npm run dev -w server` | backend on :8080 with live reload |
| `ROBODOG_SIMULATION=true npm run dev -w server` | backend + labelled simulated data |
| `npm run dev -w web` | Command Center on :5173 (proxies to :8080) |
| `npm test` | all vitest suites |
| `npm run typecheck` | tsc for every package |
| `npm run build` | production builds (`server/dist`, `web/dist`) |
| `cd mobile && ./gradlew assembleDebug` | Android APK |
| `cd mobile && ./gradlew testDebugUnitTest` | Android unit tests |

## Environment variables (server)

| Var | Default | Notes |
| --- | --- | --- |
| `ROBODOG_PORT` | 8080 | |
| `ROBODOG_HOST` | 0.0.0.0 | |
| `ROBODOG_API_TOKEN` | `robodog-dev-token` | change for anything beyond local dev |
| `ROBODOG_DB_PATH` | `./data/robodog.db` | SQLite (WAL) |
| `ROBODOG_MEDIA_DIR` | `./media` | uploaded images/videos/maps |
| `ROBODOG_SIMULATION` | false | labelled fake data |
| `ROBODOG_CORS_ORIGIN` | `*` | |

Web: `VITE_API_BASE`, `VITE_WS_URL`, `VITE_API_TOKEN` (see `web/.env.example`); all can also be changed at
runtime on the SETTINGS page.

App: Settings screen (server URL, token, ESP32 URL/Wi-Fi, simulation mode, thermal decoder, alert thresholds).

## Simulation mode

* **Server**: `ROBODOG_SIMULATION=true` generates sensor readings, robot status, alerts and a synthetic 256×192
  thermal JPEG stream, all with `source: "SIMULATION"`, plus a "SIMULATION MISSION". The web UI shows a
  persistent banner.
* **App**: Settings → SIMULATION MODE produces synthetic ESP32 readings, thermal frames and robot status.
  The moment the real TC01A streams, the simulated thermal source stops. Captures, recordings, maps and
  alerts made from simulated data carry the SIMULATION badge.

## Serving the web build from the backend

The backend does not serve the web bundle; run `npm run build -w web` and host `web/dist` with any static
server (or `npm run preview -w web`) pointed at the backend via `VITE_API_BASE`.
