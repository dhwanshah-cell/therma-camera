import { create } from 'zustand';
import type { RgbImage, ThermalImage, ThermalMap, VideoRecording } from '@robodog/shared';

export const MAX_MEDIA = 500;

interface MediaState {
  thermalImages: ThermalImage[];
  rgbImages: RgbImage[];
  videos: VideoRecording[];
  maps: ThermalMap[];
  /** Thermal images fetched individually (e.g. for alert thumbnails). */
  thermalById: Record<string, ThermalImage | null>;
  setThermalImages: (items: ThermalImage[]) => void;
  setRgbImages: (items: RgbImage[]) => void;
  setVideos: (items: VideoRecording[]) => void;
  setMaps: (items: ThermalMap[]) => void;
  upsertThermalImage: (item: ThermalImage) => void;
  upsertRgbImage: (item: RgbImage) => void;
  upsertVideo: (item: VideoRecording) => void;
  upsertMap: (item: ThermalMap) => void;
  cacheThermal: (id: string, item: ThermalImage | null) => void;
  removeThermalImage: (id: string) => void;
}

function newest<T extends { timestamp: string }>(a: T, b: T): number {
  return b.timestamp.localeCompare(a.timestamp);
}

function upsert<T extends { id: string; timestamp: string }>(list: T[], item: T): T[] {
  return [item, ...list.filter((x) => x.id !== item.id)].sort(newest).slice(0, MAX_MEDIA);
}

export const useMediaStore = create<MediaState>((set) => ({
  thermalImages: [],
  rgbImages: [],
  videos: [],
  maps: [],
  thermalById: {},
  setThermalImages: (items) => set({ thermalImages: [...items].sort(newest).slice(0, MAX_MEDIA) }),
  setRgbImages: (items) => set({ rgbImages: [...items].sort(newest).slice(0, MAX_MEDIA) }),
  setVideos: (items) => set({ videos: [...items].sort(newest).slice(0, MAX_MEDIA) }),
  setMaps: (items) => set({ maps: [...items].sort(newest).slice(0, MAX_MEDIA) }),
  upsertThermalImage: (item) =>
    set((s) => ({ thermalImages: upsert(s.thermalImages, item), thermalById: { ...s.thermalById, [item.id]: item } })),
  upsertRgbImage: (item) => set((s) => ({ rgbImages: upsert(s.rgbImages, item) })),
  upsertVideo: (item) => set((s) => ({ videos: upsert(s.videos, item) })),
  upsertMap: (item) => set((s) => ({ maps: upsert(s.maps, item) })),
  cacheThermal: (id, item) => set((s) => ({ thermalById: { ...s.thermalById, [id]: item } })),
  removeThermalImage: (id) =>
    set((s) => ({ thermalImages: s.thermalImages.filter((x) => x.id !== id), thermalById: { ...s.thermalById, [id]: null } })),
}));
