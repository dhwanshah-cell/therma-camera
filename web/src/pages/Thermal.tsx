import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { LiveCanvas } from '../components/LiveCanvas';
import { CaptureButtons } from '../components/CaptureButtons';
import { MediaThumb } from '../components/MediaThumb';
import { MediaViewer } from '../components/MediaViewer';
import { SimulationBadge } from '../components/SimulationBadge';
import { useLiveFramesStore } from '../store/liveFrames';
import { useMediaStore } from '../store/media';
import { formatTemperature, formatValue } from '../lib/format';
import type { StorageItem } from '../api/client';

export function ThermalPage() {
  const frame = useLiveFramesStore((s) => s.frames.thermal);
  const images = useMediaStore((s) => s.thermalImages);
  const setThermalImages = useMediaStore((s) => s.setThermalImages);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StorageItem | null>(null);

  useEffect(() => {
    api
      .thermalImages({ limit: 24 })
      .then((items) => setThermalImages(items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setThermalImages]);

  const header = frame?.header;
  const radiometric = header?.radiometric === true;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Thermal" subtitle="Fluke iSee TC01A live stream and captured frames" right={<CaptureButtons commands={['capture_thermal']} />} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveCanvas channel="thermal" showTemps />
        </div>
        <div className="flex flex-col gap-3">
          <Card title="Frame">
            <Row label="Palette" value={formatValue(header?.palette)} />
            <Row label="Resolution" value={header ? `${header.width} x ${header.height}` : '--'} />
            <Row label="Frame id" value={formatValue(header?.frameId)} />
            <Row label="Source" value={formatValue(header?.source)} />
            <div className="mt-1 flex justify-end">
              <SimulationBadge source={header?.source} />
            </div>
          </Card>
          <Card title="Temperature">
            {!frame ? (
              <div className="text-xs uppercase tracking-wider text-muted">Waiting for phone stream</div>
            ) : radiometric ? (
              <div className="grid grid-cols-3 gap-2">
                <Temp label="Center" value={header?.centerTemperature} accent />
                <Temp label="Min" value={header?.minTemperature} />
                <Temp label="Max" value={header?.maxTemperature} />
              </div>
            ) : (
              <div className="text-xs text-muted">
                <div className="text-text">Thermal image available</div>
                <div>Radiometric temperature unavailable</div>
              </div>
            )}
          </Card>
        </div>
      </div>
      <Card title="Thermal history" right={<span className="hmi-label">{images.length} latest</span>}>
        <ErrorNote error={error} />
        {images.length === 0 ? (
          <EmptyState>No thermal images stored</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {images.map((img) => (
              <MediaThumb
                key={img.id}
                mediaType="THERMAL_IMAGE"
                filePath={img.filePath}
                timestamp={img.timestamp}
                source={img.source}
                uploaded={img.uploaded}
                caption={img.radiometric ? `center ${formatTemperature(img.centerTemperature)}` : 'Radiometric temperature unavailable'}
                onClick={() => setSelected({ mediaType: 'THERMAL_IMAGE', item: img })}
              />
            ))}
          </div>
        )}
      </Card>
      <MediaViewer item={selected} onClose={() => setSelected(null)} onDeleted={() => setSelected(null)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-xs">
      <span className="hmi-label">{label}</span>
      <span className="num text-text">{value}</span>
    </div>
  );
}

function Temp({ label, value, accent = false }: { label: string; value: number | null | undefined; accent?: boolean }) {
  return (
    <div>
      <div className="hmi-label">{label}</div>
      <div className={`num text-lg font-semibold ${accent ? 'text-thermal' : 'text-text'}`}>{formatTemperature(value)}</div>
    </div>
  );
}
