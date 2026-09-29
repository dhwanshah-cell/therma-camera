/** Placeholder used everywhere a value is missing. Never invent a number. */
export const NA = '--';

export function isNil(v: unknown): v is null | undefined {
  return v === null || v === undefined;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Generic value formatter: null/undefined/NaN -> '--'. Numbers get optional fixed digits and unit. */
export function formatValue(v: unknown, opts: { digits?: number; unit?: string } = {}): string {
  if (isNil(v)) return NA;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return NA;
    const s = opts.digits !== undefined ? v.toFixed(opts.digits) : String(v);
    return opts.unit ? `${s} ${opts.unit}` : s;
  }
  if (typeof v === 'boolean') return v ? 'YES' : 'NO';
  if (typeof v === 'string') return v.length === 0 ? NA : v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.length === 0 ? NA : v.map((x) => formatValue(x)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Temperature in Celsius, one decimal. */
export function formatTemperature(v: number | null | undefined, digits = 1): string {
  if (!isFiniteNumber(v)) return NA;
  return `${v.toFixed(digits)} °C`;
}

export function formatHumidity(v: number | null | undefined): string {
  if (!isFiniteNumber(v)) return NA;
  return `${v.toFixed(0)} %`;
}

/** Gas raw is an MQ-series ADC reading. It is NOT a ppm value and must never be labelled as such. */
export function formatGasRaw(v: number | null | undefined): string {
  if (!isFiniteNumber(v)) return NA;
  return `${Math.round(v)}`;
}

export const GAS_RAW_UNIT_LABEL = 'raw ADC';

export function gasStatusLabel(gasAlert: boolean | null | undefined): string {
  if (isNil(gasAlert)) return NA;
  return gasAlert ? '⚠ GAS ALERT' : 'NORMAL';
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (!isFiniteNumber(v)) return NA;
  return `${v.toFixed(digits)} %`;
}

export function formatBool(v: boolean | null | undefined, yes = 'YES', no = 'NO'): string {
  if (isNil(v)) return NA;
  return v ? yes : no;
}

export function formatMissionNumber(n: number | null | undefined): string {
  if (!isFiniteNumber(n)) return 'MISSION --';
  return `MISSION #${String(Math.trunc(n)).padStart(3, '0')}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!isFiniteNumber(bytes)) return NA;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!isFiniteNumber(ms)) return NA;
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local date-time, e.g. 2026-09-29 14:30:05 */
export function formatTime(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return NA;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatClock(iso: string | null | undefined): string {
  const d = parseDate(iso);
  if (!d) return NA;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Relative time such as "3 s ago" / "5 min ago". */
export function timeAgo(iso: string | number | null | undefined, now: number = Date.now()): string {
  if (isNil(iso)) return NA;
  const t = typeof iso === 'number' ? iso : parseDate(iso)?.getTime();
  if (!isFiniteNumber(t)) return NA;
  const diff = Math.max(0, now - t);
  const s = Math.round(diff / 1000);
  if (s < 1) return 'now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

/** Age in seconds since a timestamp (ms epoch), formatted like "0.4 s". */
export function formatAgeSeconds(sinceMs: number | null | undefined, now: number = Date.now()): string {
  if (!isFiniteNumber(sinceMs)) return NA;
  const age = Math.max(0, (now - sinceMs) / 1000);
  return age < 10 ? `${age.toFixed(1)} s` : `${Math.round(age)} s`;
}

export function formatCoord(v: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(v)) return NA;
  return v.toFixed(digits);
}

export function formatPosition(p: { x: number | null; y: number | null; z?: number | null } | null | undefined): string {
  if (!p || isNil(p.x) || isNil(p.y)) return NA;
  const z = p.z === undefined ? undefined : p.z;
  const base = `x ${formatCoord(p.x)}  y ${formatCoord(p.y)}`;
  if (z === undefined) return base;
  return `${base}  z ${formatCoord(z)}`;
}

export function shortId(id: string | null | undefined, n = 8): string {
  if (!id) return NA;
  return id.length > n ? `${id.slice(0, n)}…` : id;
}
