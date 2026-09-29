import { useEffect, useMemo, useState } from 'react';
import { ALERT_SEVERITIES, ALERT_TYPES, type Alert, type AlertSeverity, type AlertType, type RgbImage, type ThermalImage } from '@robodog/shared';
import { api } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { SeverityChip } from '../components/Chip';
import { SimulationBadge } from '../components/SimulationBadge';
import { ThermalTemperatureInfo } from '../components/MediaViewer';
import { useAlertsStore } from '../store/alerts';
import { useMediaStore } from '../store/media';
import { useMissionsStore, missionLabel } from '../store/missions';
import { mediaUrl } from '../lib/config';
import { formatPosition, formatTime, formatValue } from '../lib/format';

type AckFilter = '' | 'true' | 'false';

function metadataEntries(meta: Record<string, unknown>): { key: string; value: string }[] {
  return Object.entries(meta ?? {}).map(([k, v]) => ({ key: k, value: formatValue(v) }));
}

function ThermalThumb({ id }: { id: string }) {
  const cached = useMediaStore((s) => s.thermalById[id]);
  const cache = useMediaStore((s) => s.cacheThermal);
  useEffect(() => {
    if (cached !== undefined) return;
    api
      .thermalImage(id)
      .then((img) => cache(id, img))
      .catch(() => cache(id, null));
  }, [id, cached, cache]);
  if (cached === undefined) return <div className="hmi-label">Loading thermal…</div>;
  if (cached === null) return <div className="hmi-label">Thermal image {id.slice(0, 8)} unavailable</div>;
  return <ImageWithTemps img={cached} />;
}

function ImageWithTemps({ img }: { img: ThermalImage }) {
  const url = mediaUrl(img.filePath);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded border border-line bg-black">
        {url && img.uploaded ? <img src={url} alt="Thermal" className="h-full w-full object-contain" /> : <span className="hmi-label">Not uploaded</span>}
      </div>
      <ThermalTemperatureInfo image={img} />
    </div>
  );
}

function RgbThumb({ id, images }: { id: string; images: RgbImage[] }) {
  const img = images.find((x) => x.id === id);
  if (!img) return <div className="hmi-label">RGB image {id.slice(0, 8)} not in list</div>;
  const url = mediaUrl(img.filePath);
  return (
    <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded border border-line bg-black">
      {url && img.uploaded ? <img src={url} alt="RGB" className="h-full w-full object-contain" /> : <span className="hmi-label">Not uploaded</span>}
    </div>
  );
}

export function AlertRow({ alert, onAck, rgbImages }: { alert: Alert; onAck: (id: string) => void; rgbImages: RgbImage[] }) {
  const missions = useMissionsStore((s) => s.missions);
  const meta = metadataEntries(alert.metadata);
  return (
    <li data-testid="alert-row" className={`panel flex flex-col gap-2 p-3 ${alert.acknowledged ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={alert.severity} />
        <span className="hmi-label">{alert.type}</span>
        <span className="num text-[11px] text-muted">{formatTime(alert.timestamp)}</span>
        <SimulationBadge source={alert.source} />
        <div className="ml-auto flex items-center gap-2">
          {alert.acknowledged ? (
            <span className="hmi-label text-ok">Acknowledged</span>
          ) : (
            <button className="btn" onClick={() => onAck(alert.id)}>
              Acknowledge
            </button>
          )}
        </div>
      </div>
      <div className="text-sm text-text">{alert.message}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
        <div>
          <div className="hmi-label">Location</div>
          <div className="num text-text">{alert.position ? `${formatPosition(alert.position)} (${alert.position.frame})` : '--'}</div>
        </div>
        <div>
          <div className="hmi-label">Mission</div>
          <div className="num text-text">{missionLabel(missions, alert.missionId)}</div>
        </div>
        <div className="col-span-2">
          <div className="hmi-label">Sensor values</div>
          {meta.length === 0 ? (
            <div className="num text-muted">--</div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {meta.map((m) => (
                <span key={m.key} className="num text-text">
                  <span className="text-muted">{m.key}</span> {m.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {alert.thermalImageId || alert.rgbImageId ? (
        <div className="flex flex-wrap gap-3">
          {alert.thermalImageId ? <ThermalThumb id={alert.thermalImageId} /> : null}
          {alert.rgbImageId ? <RgbThumb id={alert.rgbImageId} images={rgbImages} /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function AlertsPage() {
  const alerts = useAlertsStore((s) => s.alerts);
  const setAlerts = useAlertsStore((s) => s.setAlerts);
  const markAcknowledged = useAlertsStore((s) => s.markAcknowledged);
  const missions = useMissionsStore((s) => s.missions);
  const rgbImages = useMediaStore((s) => s.rgbImages);
  const setRgbImages = useMediaStore((s) => s.setRgbImages);
  const [type, setType] = useState<AlertType | ''>('');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [missionId, setMissionId] = useState('');
  const [ack, setAck] = useState<AckFilter>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .alerts({ limit: 300 })
      .then((list) => setAlerts(list))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setAlerts]);

  const needsRgb = useMemo(() => alerts.some((a) => a.rgbImageId), [alerts]);
  useEffect(() => {
    if (!needsRgb || rgbImages.length > 0) return;
    api
      .rgbImages({ limit: 300 })
      .then((list) => setRgbImages(list))
      .catch(() => undefined);
  }, [needsRgb, rgbImages.length, setRgbImages]);

  const filtered = useMemo(
    () =>
      alerts.filter(
        (a) =>
          (type === '' || a.type === type) &&
          (severity === '' || a.severity === severity) &&
          (missionId === '' || a.missionId === missionId) &&
          (ack === '' || String(a.acknowledged) === ack),
      ),
    [alerts, type, severity, missionId, ack],
  );

  const onAck = (id: string) => {
    markAcknowledged(id);
    api.acknowledgeAlert(id).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Alerts" subtitle={`${filtered.length} of ${alerts.length} alerts`} />
      <Card title="Filters" bodyClassName="grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="hmi-label">Type</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as AlertType | '')}>
            <option value="">All</option>
            {ALERT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="hmi-label">Severity</span>
          <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity | '')}>
            <option value="">All</option>
            {ALERT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
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
          <span className="hmi-label">Acknowledged</span>
          <select className="input" value={ack} onChange={(e) => setAck(e.target.value as AckFilter)}>
            <option value="">All</option>
            <option value="false">Open</option>
            <option value="true">Acknowledged</option>
          </select>
        </label>
      </Card>
      <ErrorNote error={error} />
      {filtered.length === 0 ? (
        <EmptyState>No alerts match</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((a) => (
            <AlertRow key={a.id} alert={a} onAck={onAck} rgbImages={rgbImages} />
          ))}
        </ul>
      )}
    </div>
  );
}
