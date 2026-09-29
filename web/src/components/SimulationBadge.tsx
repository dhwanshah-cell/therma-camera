import type { DataSource } from '@robodog/shared';

/** Visible amber badge; rendered only when the record's source is SIMULATION. */
export function SimulationBadge({ source, className = '' }: { source: DataSource | string | null | undefined; className?: string }) {
  if (source !== 'SIMULATION') return null;
  return (
    <span
      data-testid="simulation-badge"
      className={`inline-flex items-center rounded border border-sim/70 bg-sim/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-sim ${className}`}
    >
      Simulation mode
    </span>
  );
}

export function SimulationBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-sim/60 bg-sim/15 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-sim"
    >
      <span aria-hidden>&#9650;</span>
      SIMULATION MODE — data shown is simulated, not from sensors
    </div>
  );
}
