import { create } from 'zustand';
import type { Mission } from '@robodog/shared';

interface MissionsState {
  missions: Mission[];
  loaded: boolean;
  setMissions: (m: Mission[]) => void;
  upsertMission: (m: Mission) => void;
}

function byNumberDesc(a: Mission, b: Mission): number {
  return b.number - a.number;
}

export const useMissionsStore = create<MissionsState>((set) => ({
  missions: [],
  loaded: false,
  setMissions: (missions) => set({ missions: [...missions].sort(byNumberDesc), loaded: true }),
  upsertMission: (m) =>
    set((s) => ({ missions: [m, ...s.missions.filter((x) => x.id !== m.id)].sort(byNumberDesc), loaded: true })),
}));

export function selectActiveMission(missions: Mission[]): Mission | null {
  return missions.find((m) => m.status === 'ACTIVE') ?? null;
}

export function missionLabel(missions: Mission[], id: string | null | undefined): string {
  if (!id) return '--';
  const m = missions.find((x) => x.id === id);
  return m ? `#${String(m.number).padStart(3, '0')}` : id.slice(0, 8);
}
