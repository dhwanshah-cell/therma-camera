import { create } from 'zustand';
import type { SensorReading } from '@robodog/shared';

export const MAX_READINGS = 300;

interface SensorsState {
  latest: SensorReading | null;
  /** Oldest first. */
  readings: SensorReading[];
  loaded: boolean;
  setHistory: (latest: SensorReading | null, readings: SensorReading[]) => void;
  addReading: (r: SensorReading) => void;
}

function sortByTime(a: SensorReading, b: SensorReading): number {
  return a.timestamp.localeCompare(b.timestamp);
}

export const useSensorsStore = create<SensorsState>((set) => ({
  latest: null,
  readings: [],
  loaded: false,
  setHistory: (latest, readings) => {
    const sorted = [...readings].sort(sortByTime).slice(-MAX_READINGS);
    set({ latest: latest ?? sorted[sorted.length - 1] ?? null, readings: sorted, loaded: true });
  },
  addReading: (r) =>
    set((s) => {
      const exists = s.readings.some((x) => x.id === r.id);
      const readings = exists ? s.readings : [...s.readings, r].slice(-MAX_READINGS);
      const latest = !s.latest || r.timestamp >= s.latest.timestamp ? r : s.latest;
      return { readings, latest, loaded: true };
    }),
}));
