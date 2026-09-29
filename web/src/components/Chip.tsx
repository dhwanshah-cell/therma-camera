import type { AlertSeverity } from '@robodog/shared';

export function SeverityChip({ severity }: { severity: AlertSeverity }) {
  const cls =
    severity === 'CRITICAL'
      ? 'border-bad/70 bg-bad/15 text-bad'
      : severity === 'WARNING'
        ? 'border-sim/70 bg-sim/15 text-sim'
        : 'border-line bg-panel2 text-muted';
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{severity}</span>;
}

export function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'ok' | 'bad' | 'accent' | 'warn' }) {
  const cls =
    tone === 'ok'
      ? 'border-ok/60 text-ok'
      : tone === 'bad'
        ? 'border-bad/60 text-bad'
        : tone === 'accent'
          ? 'border-thermal/60 text-thermal'
          : tone === 'warn'
            ? 'border-sim/60 text-sim'
            : 'border-line text-muted';
  return <span className={`inline-flex items-center rounded border bg-panel2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{children}</span>;
}
