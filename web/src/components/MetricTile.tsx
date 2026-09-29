import type { ReactNode } from 'react';

export function MetricTile({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  size = 'md',
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'ok' | 'bad' | 'warn' | 'accent';
  size?: 'md' | 'lg';
  badge?: ReactNode;
}) {
  const color =
    tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-sim' : tone === 'accent' ? 'text-thermal' : 'text-text';
  return (
    <div className="panel flex flex-col gap-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="hmi-label">{label}</span>
        {badge}
      </div>
      <div className={`num ${size === 'lg' ? 'text-3xl' : 'text-xl'} font-semibold leading-tight ${color}`}>
        {value}
        {unit && value !== '--' ? <span className="ml-1 text-xs font-normal text-muted">{unit}</span> : null}
      </div>
      {hint ? <div className="text-[10px] text-muted">{hint}</div> : null}
    </div>
  );
}
