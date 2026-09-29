import { useMemo } from 'react';
import type { SensorReading } from '@robodog/shared';
import { formatClock } from '../lib/format';

interface Series {
  key: 'temperatureC' | 'humidityPct' | 'gasRaw';
  label: string;
  color: string;
}

const SERIES: Series[] = [
  { key: 'temperatureC', label: 'Temp °C', color: '#ff7a1a' },
  { key: 'humidityPct', label: 'Humidity %', color: '#38bdf8' },
  { key: 'gasRaw', label: 'Gas raw (ADC)', color: '#a78bfa' },
];

const W = 800;
const H = 220;
const PAD = { l: 8, r: 8, t: 10, b: 22 };

/**
 * Time-series of the last N readings drawn as SVG polylines, one normalised lane per series
 * (each series is scaled to its own min/max so the three quantities are readable together).
 * Gaps (null values) break the line rather than being interpolated.
 */
export function SensorChart({ readings, limit = 120 }: { readings: SensorReading[]; limit?: number }) {
  const data = useMemo(() => readings.slice(-limit), [readings, limit]);
  const lines = useMemo(() => {
    const n = data.length;
    return SERIES.map((s) => {
      const values = data.map((r) => r[s.key]);
      const defined = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (defined.length === 0) return { ...s, segments: [] as string[], min: null, max: null };
      let min = Math.min(...defined);
      let max = Math.max(...defined);
      if (max === min) {
        min -= 1;
        max += 1;
      }
      const segments: string[] = [];
      let current: string[] = [];
      values.forEach((v, i) => {
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          if (current.length) segments.push(current.join(' '));
          current = [];
          return;
        }
        const x = PAD.l + (n > 1 ? (i / (n - 1)) * (W - PAD.l - PAD.r) : (W - PAD.l - PAD.r) / 2);
        const y = PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
        current.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      });
      if (current.length) segments.push(current.join(' '));
      return { ...s, segments, min, max };
    });
  }, [data]);

  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-xs uppercase tracking-wider text-muted">No sensor readings yet</div>;
  }

  const first = data[0]!;
  const last = data[data.length - 1]!;
  const alertMarks = data
    .map((r, i) => (r.gasAlert ? i : -1))
    .filter((i) => i >= 0)
    .map((i) => PAD.l + (data.length > 1 ? (i / (data.length - 1)) * (W - PAD.l - PAD.r) : 0));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-48 w-full" role="img" aria-label="Sensor readings time series">
        <rect x="0" y="0" width={W} height={H} fill="#0b0f14" />
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="#1f2a37" strokeDasharray="3 4" />
        ))}
        {alertMarks.map((x, i) => (
          <line key={i} x1={x} x2={x} y1={PAD.t} y2={H - PAD.b} stroke="#ef4444" strokeOpacity="0.35" />
        ))}
        {lines.map((l) =>
          l.segments.map((pts, i) => (
            <polyline key={`${l.key}-${i}`} points={pts} fill="none" stroke={l.color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          )),
        )}
        <text x={PAD.l} y={H - 6} fill="#8a97a8" fontSize="11" fontFamily="monospace">
          {formatClock(first.timestamp)}
        </text>
        <text x={W - PAD.r} y={H - 6} fill="#8a97a8" fontSize="11" fontFamily="monospace" textAnchor="end">
          {formatClock(last.timestamp)}
        </text>
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-3" style={{ background: l.color }} />
            {l.label}
            <span className="num">{l.min === null ? '(no data)' : `${l.min.toFixed(0)}–${l.max?.toFixed(0)}`}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-0.5 bg-bad" /> gas alert
        </span>
        <span className="ml-auto">{data.length} readings · each series scaled to its own range</span>
      </div>
    </div>
  );
}
