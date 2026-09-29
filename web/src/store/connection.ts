import { create } from 'zustand';
import type { HealthResponse } from '@robodog/shared';

export type WsState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface Presence {
  phoneConnected: boolean;
  webClients: number;
  lastPhoneSeen: string | null;
}

interface ConnectionState {
  wsState: WsState;
  reconnectAttempt: number;
  lastError: string | null;
  clientId: string | null;
  serverTime: string | null;
  /** Simulation flag reported by /api/health or the WS welcome; null until known. */
  simulation: boolean | null;
  health: HealthResponse | null;
  healthError: string | null;
  presence: Presence | null;
  lastPong: number | null;
  setWsState: (s: WsState, error?: string | null) => void;
  setReconnectAttempt: (n: number) => void;
  setWelcome: (w: { clientId: string; serverTime: string; simulation: boolean }) => void;
  setHealth: (h: HealthResponse | null, error?: string | null) => void;
  setPresence: (p: Presence) => void;
  setLastPong: (t: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  wsState: 'idle',
  reconnectAttempt: 0,
  lastError: null,
  clientId: null,
  serverTime: null,
  simulation: null,
  health: null,
  healthError: null,
  presence: null,
  lastPong: null,
  setWsState: (wsState, error = null) => set({ wsState, lastError: error }),
  setReconnectAttempt: (reconnectAttempt) => set({ reconnectAttempt }),
  setWelcome: (w) => set({ clientId: w.clientId, serverTime: w.serverTime, simulation: w.simulation }),
  setHealth: (health, error = null) =>
    set((s) => ({ health, healthError: error, simulation: health ? health.simulation : s.simulation })),
  setPresence: (presence) => set({ presence }),
  setLastPong: (lastPong) => set({ lastPong }),
}));
