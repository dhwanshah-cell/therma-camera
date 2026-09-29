# ROBO-DOG Command Center (`@robodog/web`)

Web dashboard for the RoboDog search-and-rescue robot. React 18 + TypeScript (strict) + Vite 5 +
Tailwind CSS 3 + react-router 6 + zustand + three.js. All data models, API paths and the live-frame
codec come from the shared package `@robodog/shared`.

## Run

From the monorepo root:

```bash
npm install -w web          # once
npm run dev -w web          # http://localhost:5173
```

The dev server proxies `/api`, `/ws` (WebSocket) and `/media` to the RoboDog server, which is expected
on `http://localhost:8080` (`npm run dev -w server`, or `npm run dev:sim` for simulation mode). Set
`ROBODOG_SERVER_URL` to proxy somewhere else.

Other scripts (all `-w web`): `build` (`tsc --noEmit && vite build` -> `web/dist`), `preview`,
`typecheck`, `lint` (typecheck), `test` (vitest, jsdom).

## Environment

Copy `web/.env.example` to `web/.env` if you need to change the defaults.

| Variable         | Default                                | Meaning                                                                 |
| ---------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `VITE_API_BASE`  | `''` (same origin, proxied by Vite)    | REST base URL, e.g. `http://192.168.1.20:8080`                          |
| `VITE_WS_URL`    | derived (`ws(s)://<host>/ws`, or from `VITE_API_BASE`) | WebSocket URL                                            |
| `VITE_API_TOKEN` | `robodog-dev-token` (`DEV_API_TOKEN`)  | Shared API token, sent as `x-robodog-token` / `?token=` for media and WS |

All three can be overridden at runtime on the **SETTINGS** page; overrides live in `localStorage`
(`robodog.apiBase`, `robodog.wsUrl`, `robodog.token`). Never commit real tokens.

## Pages

| Route       | Page       | Data                                                                                   |
| ----------- | ---------- | -------------------------------------------------------------------------------------- |
| `/`         | DASHBOARD  | connections (WS presence + `GET /api/robot`), environment (`/api/sensors` + WS `sensor`), live previews, latest 5 alerts, active mission |
| `/live`     | LIVE       | thermal + RGB live canvases (WS binary frames), DHT11/gas tiles, robot strip, capture/record commands |
| `/thermal`  | THERMAL    | live thermal, palette / temperatures from the frame header (only when `radiometric`), `GET /api/thermal/images` history |
| `/sensors`  | SENSORS    | TEMPERATURE / HUMIDITY / GAS RAW / GAS STATUS tiles, SVG time series of the last readings |
| `/alerts`   | ALERTS     | `GET /api/alerts` + WS `alert`, filters, metadata, linked thermal/RGB thumbnails, `POST /api/alerts/:id/acknowledge` |
| `/map`      | MAP        | 2D canvas of `GET /api/maps/:id` (points, trajectory), gas alerts + positioned items from `GET /api/missions/:id/summary` |
| `/map3d`    | 3D MAP     | three.js point cloud of maps with `hasDepth`; grid only + "Waiting for depth/pose data." when no point has `z` |
| `/storage`  | STORAGE    | `GET /api/storage` unified grid, viewer modal with full metadata, download, delete (thermal images: `DELETE /api/thermal/images/:id`) |
| `/missions` | MISSIONS   | `GET/POST /api/missions`, `PATCH /api/missions/:id` (end mission, notes), detail from `/summary` |
| `/robot`    | ROBOT      | `GET /api/robot` + WS `robot`, `GET /api/robot/events`                                   |
| `/settings` | SETTINGS   | server URL, WS URL, token (masked), reconnect, health, about                            |

## Where the data comes from

- REST: `src/api/client.ts` (fetch wrapper adding `x-robodog-token`).
- WebSocket: `src/api/ws.ts` — connects to `/ws?token=…`, sends `hello` (role `web`) then
  `subscribe` (`thermal`, `rgb`), reconnects with backoff, pings every 15 s. JSON messages update the
  zustand stores in `src/store/*`; binary frames are decoded with `decodeLiveFrame` from
  `@robodog/shared` and drawn on a canvas via `createImageBitmap`.
- Media files are loaded from the server-relative `filePath` (`/media/...`) with `?token=` appended.

## Accuracy rules baked into the UI

- Any `null` value renders as `--` (or "Unavailable" / "Waiting for sensor"); nothing is invented.
- Records with `source: 'SIMULATION'` show an amber **SIMULATION MODE** badge; when `/api/health`
  (or the WS `welcome`) reports `simulation: true` a persistent banner is shown in the header.
- Temperatures are only displayed when the record/frame `radiometric` flag is `true`; otherwise the UI
  says "Thermal image available / Radiometric temperature unavailable".
- Gas raw is an MQ-series ADC value and is labelled "raw ADC", never ppm.
- The 3D map renders only points that carry a real `z`; otherwise it shows the grid and
  "Waiting for depth/pose data.".

## Layout

`src/api` (client, ws) · `src/store` (zustand slices) · `src/components` (StatusDot, Card, MetricTile,
SimulationBadge, LiveCanvas, MediaThumb, MediaViewer, Modal, Nav, Header, …) · `src/pages` ·
`src/lib` (`format.ts`, `palette.ts`, `map3d.ts` helpers, `map3dScene.ts` three.js scene, `config.ts`).
