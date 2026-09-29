import { create } from 'zustand';
import type { LiveFrameHeader } from '@robodog/shared';

export type LiveChannel = LiveFrameHeader['channel'];

export interface LiveFrame {
  header: LiveFrameHeader;
  /** Raw JPEG bytes (copied out of the WebSocket buffer, backed by its own ArrayBuffer). */
  jpeg: Uint8Array<ArrayBuffer>;
  /** Object URL for <img>/canvas drawing; null when the environment cannot create blob URLs. */
  blobUrl: string | null;
  /** Local wall-clock ms when the frame was received. */
  receivedAt: number;
  /** Sequence number, incremented per channel. */
  seq: number;
}

interface LiveFramesState {
  frames: Record<LiveChannel, LiveFrame | null>;
  /** Receive timestamps of recent frames per channel, for fps computation. */
  recent: Record<LiveChannel, number[]>;
  seq: Record<LiveChannel, number>;
  setFrame: (channel: LiveChannel, header: LiveFrameHeader, jpeg: Uint8Array<ArrayBuffer>, receivedAt?: number) => void;
  clear: () => void;
}

const FPS_WINDOW_MS = 3000;

function makeBlobUrl(jpeg: Uint8Array<ArrayBuffer>): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') return null;
    return URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
  } catch {
    return null;
  }
}

function revoke(url: string | null): void {
  if (!url) return;
  try {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}

export const useLiveFramesStore = create<LiveFramesState>((set) => ({
  frames: { thermal: null, rgb: null },
  recent: { thermal: [], rgb: [] },
  seq: { thermal: 0, rgb: 0 },
  setFrame: (channel, header, jpeg, receivedAt = Date.now()) =>
    set((s) => {
      const prev = s.frames[channel];
      revoke(prev?.blobUrl ?? null);
      const seq = s.seq[channel] + 1;
      const recent = [...s.recent[channel].filter((t) => receivedAt - t <= FPS_WINDOW_MS), receivedAt];
      const frame: LiveFrame = { header, jpeg, blobUrl: makeBlobUrl(jpeg), receivedAt, seq };
      return {
        frames: { ...s.frames, [channel]: frame },
        recent: { ...s.recent, [channel]: recent },
        seq: { ...s.seq, [channel]: seq },
      };
    }),
  clear: () =>
    set((s) => {
      revoke(s.frames.thermal?.blobUrl ?? null);
      revoke(s.frames.rgb?.blobUrl ?? null);
      return { frames: { thermal: null, rgb: null }, recent: { thermal: [], rgb: [] } };
    }),
}));

/** Frames per second over the recent window; null when no frames in window. */
export function computeFps(recent: number[], now: number = Date.now()): number | null {
  const inWindow = recent.filter((t) => now - t <= FPS_WINDOW_MS);
  if (inWindow.length < 2) return inWindow.length === 1 ? 0 : null;
  const span = (inWindow[inWindow.length - 1]! - inWindow[0]!) / 1000;
  if (span <= 0) return null;
  return (inWindow.length - 1) / span;
}
