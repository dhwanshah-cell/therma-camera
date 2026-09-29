import { useState } from 'react';
import type { ThermalImage } from '@robodog/shared';
import { api, type StorageItem } from '../api/client';
import { mediaUrl } from '../lib/config';
import { formatBytes, formatDurationMs, formatTemperature, formatTime, formatValue } from '../lib/format';
import { useMediaStore } from '../store/media';
import { Modal } from './Modal';
import { MetaTable } from './MetaTable';
import { SimulationBadge } from './SimulationBadge';

function title(item: StorageItem): string {
  switch (item.mediaType) {
    case 'THERMAL_IMAGE':
      return 'Thermal image';
    case 'RGB_IMAGE':
      return 'RGB image';
    case 'THERMAL_VIDEO':
      return 'Thermal video';
    case 'RGB_VIDEO':
      return 'RGB video';
    case 'THERMAL_MAP':
      return 'Thermal map';
    default:
      return 'Media';
  }
}

/** Temperature panel: temperatures are only shown when the record's radiometric flag is true. */
export function ThermalTemperatureInfo({ image }: { image: ThermalImage }) {
  if (!image.radiometric) {
    return (
      <div className="rounded border border-line bg-panel2 px-3 py-2 text-xs">
        <div className="text-text">Thermal image available</div>
        <div className="text-muted">Radiometric temperature unavailable</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2 rounded border border-thermal/40 bg-thermal/5 px-3 py-2">
      <T label="Center" v={image.centerTemperature} accent />
      <T label="Min" v={image.minTemperature} />
      <T label="Max" v={image.maxTemperature} />
      <div className="col-span-3 text-[10px] text-muted">
        emissivity {formatValue(image.emissivity)} · distance {formatValue(image.distance, { unit: 'm' })}
      </div>
    </div>
  );
}

function T({ label, v, accent = false }: { label: string; v: number | null; accent?: boolean }) {
  return (
    <div>
      <div className="hmi-label">{label}</div>
      <div className={`num text-base font-semibold ${accent ? 'text-thermal' : 'text-text'}`}>{formatTemperature(v)}</div>
    </div>
  );
}

const META_FORMAT: Record<string, (v: unknown) => string> = {
  timestamp: (v) => formatTime(typeof v === 'string' ? v : null),
  endTimestamp: (v) => formatTime(typeof v === 'string' ? v : null),
  sizeBytes: (v) => formatBytes(typeof v === 'number' ? v : null),
  durationMs: (v) => formatDurationMs(typeof v === 'number' ? v : null),
};

export function MediaViewer({ item, onClose, onDeleted }: { item: StorageItem | null; onClose: () => void; onDeleted?: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removeThermalImage = useMediaStore((s) => s.removeThermalImage);
  if (!item) return null;
  const rec = item.item;
  const url = mediaUrl(rec.filePath);
  const isVideo = item.mediaType === 'THERMAL_VIDEO' || item.mediaType === 'RGB_VIDEO';
  const isImage = item.mediaType === 'THERMAL_IMAGE' || item.mediaType === 'RGB_IMAGE';
  const isPngMap = item.mediaType === 'THERMAL_MAP' && (rec.filePath?.toLowerCase().endsWith('.png') ?? false);
  const uploaded = 'uploaded' in rec ? rec.uploaded : true;
  const canDelete = item.mediaType === 'THERMAL_IMAGE';

  const location =
    'x' in rec
      ? rec.x === null || rec.y === null
        ? '--'
        : `x ${rec.x.toFixed(2)}  y ${rec.y.toFixed(2)}  z ${rec.z === null ? '--' : rec.z.toFixed(2)}  (${rec.positionFrame ?? '--'})`
      : 'bounds' in rec && rec.bounds
        ? `x ${rec.bounds.minX.toFixed(2)}…${rec.bounds.maxX.toFixed(2)}  y ${rec.bounds.minY.toFixed(2)}…${rec.bounds.maxY.toFixed(2)}`
        : '--';

  const doDelete = async () => {
    if (!canDelete) return;
    if (!window.confirm('Delete this thermal image from the server? This cannot be undone.')) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteThermalImage(rec.id);
      removeThermalImage(rec.id);
      onDeleted?.(rec.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${title(item)} · ${formatTime(rec.timestamp)}`}>
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-3">
        <div className="flex min-h-[240px] items-center justify-center rounded border border-line bg-black lg:col-span-2">
          {!uploaded || !url ? (
            <div className="text-xs uppercase tracking-wider text-muted">{uploaded ? 'No file path' : 'File not uploaded yet'}</div>
          ) : isVideo ? (
            <video src={url} controls className="max-h-[70vh] w-full" />
          ) : isImage || isPngMap ? (
            <img src={url} alt={title(item)} className="max-h-[70vh] w-full object-contain" />
          ) : (
            <div className="p-4 text-xs text-muted">
              Map export file: <span className="num text-text">{rec.filePath ?? '--'}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SimulationBadge source={rec.source} />
            {url && uploaded ? (
              <a className="btn" href={url} download={'fileName' in rec ? rec.fileName : undefined} target="_blank" rel="noreferrer">
                Download
              </a>
            ) : null}
            <button className="btn btn-danger" disabled={!canDelete || deleting} onClick={() => void doDelete()} title={canDelete ? '' : 'Delete is only available for thermal images'}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
          {error ? <div className="text-xs text-bad">{error}</div> : null}
          {item.mediaType === 'THERMAL_IMAGE' ? <ThermalTemperatureInfo image={item.item} /> : null}
          <div>
            <div className="hmi-label mb-1">Location</div>
            <div className="num text-xs text-text">{location}</div>
          </div>
          <div>
            <div className="hmi-label mb-1">Metadata</div>
            <MetaTable data={rec as unknown as Record<string, unknown>} format={META_FORMAT} />
          </div>
        </div>
      </div>
    </Modal>
  );
}
