import type { ReactNode } from 'react';

export function Card({
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel flex flex-col ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <h2 className="hmi-title">{title}</h2>
          {right ? <div className="flex items-center gap-2">{right}</div> : null}
        </header>
      )}
      <div className={`p-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-text">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded border border-dashed border-line p-6 text-center text-xs uppercase tracking-wider text-muted">{children}</div>;
}

export function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="mb-3 rounded border border-bad/50 bg-bad/10 px-3 py-2 text-xs text-bad">{error}</div>;
}
