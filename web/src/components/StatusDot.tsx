export type DotState = 'ok' | 'bad' | 'warn' | 'unknown';

export function StatusDot({ state, pulse = false, className = '' }: { state: DotState; pulse?: boolean; className?: string }) {
  const color =
    state === 'ok' ? 'bg-ok shadow-[0_0_6px_#22c55e]' : state === 'bad' ? 'bg-bad' : state === 'warn' ? 'bg-sim' : 'bg-muted/50';
  return (
    <span
      role="img"
      aria-label={state}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color} ${pulse && state === 'ok' ? 'animate-pulse' : ''} ${className}`}
    />
  );
}

export function boolDot(v: boolean | null | undefined): DotState {
  if (v === null || v === undefined) return 'unknown';
  return v ? 'ok' : 'bad';
}

export function StatusRow({ label, state, value }: { label: string; state: DotState; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2">
        <StatusDot state={state} />
        <span className="hmi-label">{label}</span>
      </div>
      <span className={`num text-xs ${state === 'ok' ? 'text-ok' : state === 'bad' ? 'text-bad' : 'text-muted'}`}>{value}</span>
    </div>
  );
}
