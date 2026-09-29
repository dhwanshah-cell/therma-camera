import { create } from 'zustand';
import type { RobotStatus } from '@robodog/shared';
import type { RobotEvent } from '../api/client';

interface RobotState {
  status: RobotStatus | null;
  events: RobotEvent[];
  loaded: boolean;
  setStatus: (s: RobotStatus | null) => void;
  setEvents: (e: RobotEvent[]) => void;
}

export const useRobotStore = create<RobotState>((set) => ({
  status: null,
  events: [],
  loaded: false,
  setStatus: (status) =>
    set((s) => {
      if (status && s.status && status.timestamp < s.status.timestamp) return { loaded: true };
      return { status, loaded: true };
    }),
  setEvents: (events) => set({ events }),
}));
