import type { MediaType } from '@robodog/shared';
import { mediaUrl } from '../lib/config';
import { formatTime } from '../lib/format';
import { SimulationBadge } from './SimulationBadge';

export interface ThumbProps {
  mediaType: MediaType;
  filePath: string | null;
  timestamp: string;
  source: string;
  caption?: string;
  uploaded?: boolean;
  onClick?: () => void;
}

function kindLabel(t: MediaType): string {
  switch (t) {
    case 'THERMAL_IMAGE':
      return 'THERMAL';
    case 'RGB_IMAGE':
      return 'RGB';
    case 'THERMAL_VIDEO':
      return 'THERMAL VIDEO';
    case 'RGB_VIDEO':
      return 'RGB VIDEO';
    case 'THERMAL_MAP':
      return 'MAP';
    default:
      return t;
  }
}

/** Thumbnail for any media record. Images render the file; videos/maps render a labelled placeholder. */
export function MediaThumb({ mediaType, filePath, timestamp, source, caption, uploaded = true, onClick }: ThumbProps) {
  const url = mediaUrl(filePath);
  const isImage = mediaType === 'THERMAL_IMAGE' || mediaType === 'RGB_IMAGE';
  const isPng = filePath?.toLowerCase().endsWith('.png') ?? false;
  const showImage = url !== null && uploaded && (isImage || (mediaType === 'THERMAL_MAP' && isPng));
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-md border border-line bg-panel text-left transition-colors hover:border-muted"
    >
      <div className="relative flex aspect-[4/3] items-center justify-center bg-black">
        {showImage ? (
          <img src={url} alt={caption ?? kindLabel(mediaType)} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted">
            <span className="text-2xl" aria-hidden>
              {mediaType.includes('VIDEO') ? '▶' : mediaType === 'THERMAL_MAP' ? '▦' : '□'}
            </span>
            <span className="text-[10px] uppercase tracking-wider">{uploaded ? kindLabel(mediaType) : 'Not uploaded yet'}</span>
          </div>
        )}
        <div className="absolute left-1 top-1 flex items-center gap-1">
          <span
            className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              mediaType.startsWith('THERMAL') ? 'bg-thermal/80 text-black' : 'bg-bg/80 text-text'
            }`}
          >
            {kindLabel(mediaType)}
          </span>
          <SimulationBadge source={source} />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <span className="num text-[11px] text-text">{formatTime(timestamp)}</span>
        {caption ? <span className="truncate text-[10px] text-muted">{caption}</span> : null}
      </div>
    </button>
  );
}
