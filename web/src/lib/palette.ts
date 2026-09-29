/**
 * IRON-like colour ramp used for thermal intensity / temperature rendering on the maps.
 * Input is a normalised intensity 0..1 (clamped). Output components are 0..255.
 */
const IRON_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 0, 0, 0],
  [0.15, 30, 0, 80],
  [0.3, 110, 0, 140],
  [0.45, 180, 20, 110],
  [0.6, 230, 70, 40],
  [0.75, 250, 140, 0],
  [0.9, 255, 210, 40],
  [1.0, 255, 255, 220],
];

export type Rgb = [number, number, number];

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function intensityToRgb(t: number): Rgb {
  const x = clamp01(t);
  for (let i = 1; i < IRON_STOPS.length; i += 1) {
    const a = IRON_STOPS[i - 1]!;
    const b = IRON_STOPS[i]!;
    if (x <= b[0]) {
      const span = b[0] - a[0];
      const k = span > 0 ? (x - a[0]) / span : 0;
      return [
        Math.round(a[1] + (b[1] - a[1]) * k),
        Math.round(a[2] + (b[2] - a[2]) * k),
        Math.round(a[3] + (b[3] - a[3]) * k),
      ];
    }
  }
  const last = IRON_STOPS[IRON_STOPS.length - 1]!;
  return [last[1], last[2], last[3]];
}

export function intensityToCss(t: number, alpha = 1): string {
  const [r, g, b] = intensityToRgb(t);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Normalise a temperature into 0..1 given a min/max range. Returns null when the range is degenerate. */
export function temperatureToIntensity(temp: number, min: number, max: number): number | null {
  if (!Number.isFinite(temp) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return clamp01((temp - min) / (max - min));
}

/** Compute the min/max of the defined temperatures in a list; null when none. */
export function temperatureRange(values: ReadonlyArray<number | null | undefined>): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

/** CSS gradient string for legends. */
export function ironGradientCss(): string {
  return `linear-gradient(90deg, ${IRON_STOPS.map((s) => `rgb(${s[1]},${s[2]},${s[3]}) ${Math.round(s[0] * 100)}%`).join(', ')})`;
}
