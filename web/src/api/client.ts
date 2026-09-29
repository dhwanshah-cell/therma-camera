import {
  API,
  AUTH_HEADER,
  type Alert,
  type AlertSeverity,
  type AlertType,
  type HealthResponse,
  type MediaType,
  type Mission,
  type RgbImage,
  type RobotStatus,
  type SensorReading,
  type ThermalImage,
  type ThermalMap,
  type ThermalPoint,
  type VideoRecording,
} from '@robodog/shared';
import { getApiBase, getToken } from '../lib/config';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface SensorsResponse {
  latest: SensorReading | null;
  readings: SensorReading[];
}

export interface MissionSummary {
  mission: Mission;
  alerts: Alert[];
  thermalImages: ThermalImage[];
  rgbImages: RgbImage[];
  videos: VideoRecording[];
  maps: ThermalMap[];
  sensorCount: number;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  z: number | null;
  timestamp: string;
}

export type MapDetail = ThermalMap & { points: ThermalPoint[]; trajectory: TrajectoryPoint[] };

export type StorageItem =
  | { mediaType: 'THERMAL_IMAGE'; item: ThermalImage }
  | { mediaType: 'RGB_IMAGE'; item: RgbImage }
  | { mediaType: 'THERMAL_VIDEO'; item: VideoRecording }
  | { mediaType: 'RGB_VIDEO'; item: VideoRecording }
  | { mediaType: 'THERMAL_MAP'; item: ThermalMap };

/** Robot events have no fixed shared schema; render whatever fields the server provides. */
export interface RobotEvent {
  id?: string;
  timestamp?: string;
  type?: string;
  message?: string;
  source?: string;
  [key: string]: unknown;
}

export type StatsResponse = Record<string, number | null | undefined>;

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(path: string, init: RequestInit = {}, opts: { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (opts.auth !== false) headers.set(AUTH_HEADER, getToken());
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body && typeof (body as { message: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>(API.HEALTH, {}, { auth: false }),

  sensors: (q?: { limit?: number; missionId?: string | null }) => request<SensorsResponse>(withQuery(API.SENSORS, q)),

  alerts: (q?: {
    missionId?: string | null;
    type?: AlertType | '';
    severity?: AlertSeverity | '';
    limit?: number;
    acknowledged?: boolean | '';
  }) => request<Alert[]>(withQuery(API.ALERTS, q)),
  acknowledgeAlert: (id: string) => request<Alert>(`${API.ALERTS}/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' }),

  missions: () => request<Mission[]>(API.MISSIONS),
  createMission: (body: { name?: string }) => request<Mission>(API.MISSIONS, { method: 'POST', body: JSON.stringify(body) }),
  mission: (id: string) => request<Mission>(`${API.MISSIONS}/${encodeURIComponent(id)}`),
  patchMission: (id: string, body: Partial<Pick<Mission, 'status' | 'endTime' | 'name' | 'notes'>>) =>
    request<Mission>(`${API.MISSIONS}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  missionSummary: (id: string) => request<MissionSummary>(`${API.MISSIONS}/${encodeURIComponent(id)}/summary`),

  thermalImages: (q?: { missionId?: string | null; limit?: number }) => request<ThermalImage[]>(withQuery(API.THERMAL_IMAGES, q)),
  thermalImage: (id: string) => request<ThermalImage>(`${API.THERMAL_IMAGES}/${encodeURIComponent(id)}`),
  deleteThermalImage: (id: string) => request<unknown>(`${API.THERMAL_IMAGES}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  rgbImages: (q?: { missionId?: string | null; limit?: number }) => request<RgbImage[]>(withQuery(API.RGB_IMAGES, q)),
  thermalVideos: (q?: { missionId?: string | null; limit?: number }) => request<VideoRecording[]>(withQuery(API.THERMAL_VIDEOS, q)),
  rgbVideos: (q?: { missionId?: string | null; limit?: number }) => request<VideoRecording[]>(withQuery(API.RGB_VIDEOS, q)),

  maps: (q?: { missionId?: string | null }) => request<ThermalMap[]>(withQuery(API.MAPS, q)),
  map: (id: string) => request<MapDetail>(`${API.MAPS}/${encodeURIComponent(id)}`),

  robot: () => request<RobotStatus | null>(API.ROBOT),
  robotEvents: () => request<RobotEvent[]>(`${API.ROBOT}/events`),

  storage: (q?: { type?: MediaType | ''; missionId?: string | null; from?: string; to?: string; limit?: number }) =>
    request<StorageItem[]>(withQuery('/api/storage', q)),
  stats: () => request<StatsResponse>('/api/stats'),
};

export type Api = typeof api;
