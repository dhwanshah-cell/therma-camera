import { useEffect, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div className="panel flex max-h-full w-full max-w-6xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="hmi-title">{title}</h2>
          <button className="btn" onClick={onClose} aria-label="Close">
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
