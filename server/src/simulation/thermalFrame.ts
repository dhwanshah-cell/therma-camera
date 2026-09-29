import { encode } from 'jpeg-js';
import { TC01A } from '@robodog/shared';

/**
 * IRON-like palette: black -> purple -> red -> orange -> yellow -> white.
 * Control points are interpolated into a 256 entry RGB lookup table.
 */
const IRON_STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [0, 0, 0]],
  [0.15, [32, 0, 96]],
  [0.35, [128, 0, 128]],
  [0.55, [220, 40, 40]],
  [0.75, [255, 140, 0]],
  [0.9, [255, 220, 60]],
  [1.0, [255, 255, 255]],
];

function buildLut(): Uint8Array {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = IRON_STOPS[0]!;
    let hi = IRON_STOPS[IRON_STOPS.length - 1]!;
    for (let s = 0; s < IRON_STOPS.length - 1; s++) {
      const a = IRON_STOPS[s]!;
      const b = IRON_STOPS[s + 1]!;
      if (t >= a[0] && t <= b[0]) {
        lo = a;
        hi = b;
        break;
      }
    }
    const span = hi[0] - lo[0] || 1;
    const f = (t - lo[0]) / span;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(lo[1][c]! + (hi[1][c]! - lo[1][c]!) * f);
  }
  return lut;
}

const IRON_LUT = buildLut();

export interface SyntheticFrameOptions {
  width?: number;
  height?: number;
  /** Animation phase in seconds; moves the hot blob around. */
  phase: number;
  quality?: number;
}

/**
 * Render a clearly synthetic 256x192 "thermal" image: a soft gradient background with a warm
 * blob drifting around, mapped through the IRON palette and encoded as a baseline JPEG.
 * No temperatures are implied; the frame header must say radiometric: false, source: SIMULATION.
 */
export function renderSyntheticThermalJpeg(opts: SyntheticFrameOptions): Buffer {
  const width = opts.width ?? TC01A.THERMAL_WIDTH;
  const height = opts.height ?? TC01A.THERMAL_HEIGHT;
  const rgba = Buffer.alloc(width * height * 4);
  const cx = width * (0.5 + 0.3 * Math.cos(opts.phase * 0.6));
  const cy = height * (0.5 + 0.3 * Math.sin(opts.phase * 0.45));
  const radius = Math.min(width, height) * (0.18 + 0.05 * Math.sin(opts.phase * 1.3));
  const noiseSeed = Math.floor(opts.phase * 1000);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Cool vertical gradient background plus a gaussian hot blob and a little deterministic noise.
      const background = 0.15 + 0.2 * (y / height);
      const dx = x - cx;
      const dy = y - cy;
      const blob = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius));
      const noise = ((Math.sin(x * 12.9898 + y * 78.233 + noiseSeed) * 43758.5453) % 1) * 0.03;
      const v = Math.max(0, Math.min(1, background + 0.8 * blob + noise));
      const idx = Math.round(v * 255) * 3;
      const o = (y * width + x) * 4;
      rgba[o] = IRON_LUT[idx]!;
      rgba[o + 1] = IRON_LUT[idx + 1]!;
      rgba[o + 2] = IRON_LUT[idx + 2]!;
      rgba[o + 3] = 255;
    }
  }
  return encode({ data: rgba, width, height }, opts.quality ?? 80).data;
}
