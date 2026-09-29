import { create } from 'zustand';
import type { Alert } from '@robodog/shared';

export const MAX_ALERTS = 500;

interface AlertsState {
  alerts: Alert[];
  loaded: boolean;
  setAlerts: (alerts: Alert[]) => void;
  upsertAlert: (a: Alert) => void;
  markAcknowledged: (id: string) => void;
}

function newestFirst(a: Alert, b: Alert): number {
  return b.timestamp.localeCompare(a.timestamp);
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  loaded: false,
  setAlerts: (alerts) => set({ alerts: [...alerts].sort(newestFirst).slice(0, MAX_ALERTS), loaded: true }),
  upsertAlert: (a) =>
    set((s) => {
      const rest = s.alerts.filter((x) => x.id !== a.id);
      return { alerts: [a, ...rest].sort(newestFirst).slice(0, MAX_ALERTS), loaded: true };
    }),
  markAcknowledged: (id) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) })),
}));
