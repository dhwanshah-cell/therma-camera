import { api } from '../api/client';
import { wsClient } from '../api/ws';
import { useAlertsStore } from '../store/alerts';
import { useConnectionStore } from '../store/connection';
import { useMissionsStore } from '../store/missions';
import { useRobotStore } from '../store/robot';
import { useSensorsStore } from '../store/sensors';

const HEALTH_POLL_MS = 15000;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Fetch health; sets the simulation flag and health error state. */
export async function refreshHealth(): Promise<void> {
  try {
    const h = await api.health();
    useConnectionStore.getState().setHealth(h, null);
  } catch (e) {
    useConnectionStore.getState().setHealth(null, errMsg(e));
  }
}

/** Initial REST loads for the stores that pages share. Failures are non-fatal. */
export async function loadInitialData(): Promise<void> {
  await Promise.all([
    api
      .sensors({ limit: 200 })
      .then((r) => useSensorsStore.getState().setHistory(r.latest, r.readings))
      .catch(() => undefined),
    api
      .alerts({ limit: 200 })
      .then((a) => useAlertsStore.getState().setAlerts(a))
      .catch(() => undefined),
    api
      .robot()
      .then((s) => useRobotStore.getState().setStatus(s))
      .catch(() => undefined),
    api
      .missions()
      .then((m) => useMissionsStore.getState().setMissions(m))
      .catch(() => undefined),
  ]);
}

let started = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;

export function startApp(): void {
  if (started) return;
  started = true;
  void refreshHealth();
  void loadInitialData();
  wsClient.connect();
  healthTimer = setInterval(() => void refreshHealth(), HEALTH_POLL_MS);
}

export function stopApp(): void {
  started = false;
  if (healthTimer) clearInterval(healthTimer);
  healthTimer = null;
  wsClient.disconnect();
}

/** Called from the SETTINGS page after runtime settings change. */
export function applySettingsAndReconnect(): void {
  void refreshHealth();
  void loadInitialData();
  wsClient.reconnect();
}
