import { API, DEV_API_TOKEN } from '@robodog/shared';

/** localStorage keys for runtime overrides made on the SETTINGS page. */
export const SETTINGS_KEYS = {
  apiBase: 'robodog.apiBase',
  wsUrl: 'robodog.wsUrl',
  token: 'robodog.token',
  deviceId: 'robodog.deviceId',
} as const;

function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(key);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null || value.trim().length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, value.trim());
  } catch {
    /* storage unavailable (private mode) */
  }
}

function envString(name: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const v = env[name];
  return typeof v === 'string' ? v.trim() : '';
}

/** REST base URL ('' = same origin, proxied by Vite in development). Trailing slash removed. */
export function getApiBase(): string {
  const v = readLocal(SETTINGS_KEYS.apiBase) ?? envString('VITE_API_BASE');
  return v.replace(/\/+$/, '');
}

/** Shared API token. Default is the development token from @robodog/shared. */
export function getToken(): string {
  // envString() yields '' when the variable is unset, so fall through with || rather than ??.
  return readLocal(SETTINGS_KEYS.token) ?? (envString('VITE_API_TOKEN') || DEV_API_TOKEN);
}

export function isDefaultToken(): boolean {
  return getToken() === DEV_API_TOKEN;
}

/** WebSocket URL, derived from the API base or the page location when not configured. */
export function getWsUrl(): string {
  const explicit = readLocal(SETTINGS_KEYS.wsUrl) ?? envString('VITE_WS_URL');
  if (explicit) return explicit;
  const base = getApiBase();
  if (base) {
    return base.replace(/^http/i, 'ws') + API.WS;
  }
  if (typeof location !== 'undefined' && location.host) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}${API.WS}`;
  }
  return `ws://localhost:8080${API.WS}`;
}

export interface RuntimeSettings {
  apiBase: string;
  wsUrl: string;
  token: string;
}

export function getSettings(): RuntimeSettings {
  return {
    apiBase: readLocal(SETTINGS_KEYS.apiBase) ?? '',
    wsUrl: readLocal(SETTINGS_KEYS.wsUrl) ?? '',
    token: readLocal(SETTINGS_KEYS.token) ?? '',
  };
}

export function saveSettings(s: Partial<RuntimeSettings>): void {
  if (s.apiBase !== undefined) writeLocal(SETTINGS_KEYS.apiBase, s.apiBase);
  if (s.wsUrl !== undefined) writeLocal(SETTINGS_KEYS.wsUrl, s.wsUrl);
  if (s.token !== undefined) writeLocal(SETTINGS_KEYS.token, s.token);
}

export function clearSettings(): void {
  writeLocal(SETTINGS_KEYS.apiBase, null);
  writeLocal(SETTINGS_KEYS.wsUrl, null);
  writeLocal(SETTINGS_KEYS.token, null);
}

/** Stable per-browser device id used in the WebSocket hello. */
export function getDeviceId(): string {
  const existing = readLocal(SETTINGS_KEYS.deviceId);
  if (existing) return existing;
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  const id = `web-${rnd}`;
  writeLocal(SETTINGS_KEYS.deviceId, id);
  return id;
}

/**
 * Build a URL for a server media file. `filePath` is a server-relative path such as
 * /media/RoboDog/Thermal/Images/x.jpg. The token is appended as a query parameter because
 * <img>, <video> and <a download> cannot send headers.
 */
export function mediaUrl(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  if (/^(https?:|blob:|data:)/i.test(filePath)) return filePath;
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
  const sep = path.includes('?') ? '&' : '?';
  return `${getApiBase()}${path}${sep}token=${encodeURIComponent(getToken())}`;
}
