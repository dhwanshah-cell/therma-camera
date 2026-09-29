import { useEffect, useRef } from 'react';
import type { LiveFrame } from '../store/liveFrames';
import { useLiveFramesStore, computeFps } from '../store/liveFrames';
import { useNow } from '../hooks/useNow';
import { formatAgeSeconds, formatTemperature } from '../lib/format';
import { SimulationBadge } from './SimulationBadge';

/** A frame older than this is treated as stalled. */
export const STALE_AFTER_MS = 5000;

async function drawFrame(canvas: HTMLCanvasElement, frame: LiveFrame): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const blob = new Blob([frame.jpeg], { type: 'image/jpeg' });
  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  if (typeof createImageBitmap === 'function') {
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      bitmap = null;
    }
  }
  if (!bitmap) {
    if (!frame.blobUrl) return;
    bitmap = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = frame.blobUrl as string;
    });
    if (!bitmap) return;
  }
  const w = bitmap.width || frame.header.width;
  const h = bitmap.height || frame.header.height;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
}

export function LiveCanvas({
  channel,
  className = '',
  showStats = true,
  showTemps = false,
}: {
  channel: 'thermal' | 'rgb';
  className?: string;
  showStats?: boolean;
  showTemps?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useLiveFramesStore((s) => s.frames[channel]);
  const recent = useLiveFramesStore((s) => s.recent[channel]);
  const now = useNow(500);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frame) return;
    let cancelled = false;
    void drawFrame(canvas, frame).catch(() => undefined);
    return () => {
      cancelled = true;
      void cancelled;
    };
  }, [frame]);

  const age = frame ? now - frame.receivedAt : null;
  const stalled = age !== null && age > STALE_AFTER_MS;
  const fps = computeFps(recent, now);
  const label = channel === 'thermal' ? 'THERMAL' : 'RGB';
  const header = frame?.header;
  const radiometric = header?.radiometric === true;

  return (
    <div className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-line bg-black ${className}`}>
      <canvas ref={canvasRef} className={`h-full w-full object-contain ${!frame ? 'hidden' : ''}`} aria-label={`${label} live stream`} />
      {!frame && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="hmi-label">{label}</span>
          <span className="text-xs uppercase tracking-wider text-muted">Waiting for phone stream</span>
        </div>
      )}
      {frame && stalled && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <span className="rounded border border-sim/60 bg-bg/80 px-3 py-1 text-xs uppercase tracking-wider text-sim">
            Stream stalled — last frame {formatAgeSeconds(frame.receivedAt, now)} ago
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2">
        <span className="rounded bg-bg/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-text">{label}</span>
        {header ? <SimulationBadge source={header.source} /> : null}
        {header?.palette && channel === 'thermal' ? (
          <span className="rounded bg-bg/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">{header.palette}</span>
        ) : null}
      </div>
      {showStats && (
        <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2 rounded bg-bg/80 px-2 py-1 font-mono text-[10px] text-muted">
          <span>{fps === null ? '-- fps' : `${fps.toFixed(1)} fps`}</span>
          <span>|</span>
          <span>age {frame ? formatAgeSeconds(frame.receivedAt, now) : '--'}</span>
          {header ? (
            <>
              <span>|</span>
              <span>
                {header.width}x{header.height}
              </span>
            </>
          ) : null}
        </div>
      )}
      {showTemps && frame && channel === 'thermal' && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-bg/80 px-2 py-1 font-mono text-[10px]">
          {radiometric ? (
            <span className="text-thermal">
              C {formatTemperature(header?.centerTemperature)} · MIN {formatTemperature(header?.minTemperature)} · MAX{' '}
              {formatTemperature(header?.maxTemperature)}
            </span>
          ) : (
            <span className="text-muted">Radiometric temperature unavailable</span>
          )}
        </div>
      )}
    </div>
  );
}
