import { useEffect, useState } from 'react';
import { MEDIA_TYPES, type MediaType } from '@robodog/shared';
import { api, type StorageItem } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { MediaThumb } from '../components/MediaThumb';
import { MediaViewer } from '../components/MediaViewer';
import { useMissionsStore } from '../store/missions';
import { formatTemperature } from '../lib/format';

const TYPE_LABELS: Record<MediaType, string> = {
  THERMAL_IMAGE: 'Thermal images',
  RGB_IMAGE: 'RGB images',
  THERMAL_VIDEO: 'Thermal videos',
  RGB_VIDEO: 'RGB videos',
  THERMAL_MAP: 'Maps',
};

function caption(it: StorageItem): string {
  switch (it.mediaType) {
    case 'THERMAL_IMAGE':
      return it.item.radiometric ? `center ${formatTemperature(it.item.centerTemperature)}` : 'Radiometric temperature unavailable';
    case 'RGB_IMAGE':
      return it.item.fileName;
    case 'THERMAL_VIDEO':
    case 'RGB_VIDEO':
      return it.item.fileName;
    case 'THERMAL_MAP':
      return `${it.item.name} · ${it.item.pointCount} pts`;
    default:
      return '';
  }
}

function itemKey(it: StorageItem): string {
  return `${it.mediaType}:${it.item.id}`;
}

export function StoragePage() {
  const missions = useMissionsStore((s) => s.missions);
  const [type, setType] = useState<MediaType | ''>('');
  const [missionId, setMissionId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<StorageItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<StorageItem | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = {
      type,
      missionId: missionId || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      limit: 200,
    };
    api
      .storage(q)
      .then((list) => {
        if (cancelled) return;
        setItems(Array.isArray(list) ? list : []);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, missionId, from, to, tick]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Storage"
        subtitle="All media synced from the phone"
        right={
          <button className="btn" onClick={() => setTick((t) => t + 1)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        }
      />
      <Card title="Filters" bodyClassName="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="hmi-label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as MediaType | '')}>
            <option value="">All</option>
            {MEDIA_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="hmi-label">Mission</span>
          <select className="input" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
            <option value="">All</option>
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                #{String(m.number).padStart(3, '0')} {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="hmi-label">From</span>
          <input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="hmi-label">To</span>
          <input className="input" type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </Card>
      <ErrorNote error={error} />
      {items.length === 0 ? (
        <EmptyState>{loading ? 'Loading…' : 'No media match the filters'}</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {items.map((it) => (
            <MediaThumb
              key={itemKey(it)}
              mediaType={it.mediaType}
              filePath={it.item.filePath}
              timestamp={it.item.timestamp}
              source={it.item.source}
              uploaded={'uploaded' in it.item ? it.item.uploaded : true}
              caption={caption(it)}
              onClick={() => setSelected(it)}
            />
          ))}
        </div>
      )}
      <MediaViewer
        item={selected}
        onClose={() => setSelected(null)}
        onDeleted={(id) => {
          setItems((list) => list.filter((x) => x.item.id !== id));
          setSelected(null);
        }}
      />
    </div>
  );
}
