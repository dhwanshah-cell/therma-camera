import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, EmptyState, ErrorNote, PageHeader } from '../components/Card';
import { MetricTile } from '../components/MetricTile';
import { SimulationBadge } from '../components/SimulationBadge';
import { useRobotStore } from '../store/robot';
import { useMissionsStore, missionLabel } from '../store/missions';
import { useNow } from '../hooks/useNow';
import { formatBool, formatPercent, formatTime, formatValue, timeAgo } from '../lib/format';

export function RobotPage() {
  const status = useRobotStore((s) => s.status);
  const events = useRobotStore((s) => s.events);
  const setStatus = useRobotStore((s) => s.setStatus);
  const setEvents = useRobotStore((s) => s.setEvents);
  const missions = useMissionsStore((s) => s.missions);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(2000);

  useEffect(() => {
    api
      .robot()
      .then((s) => setStatus(s))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    api
      .robotEvents()
      .then((ev) => setEvents(Array.isArray(ev) ? ev : []))
      .catch(() => setEvents([]));
  }, [setStatus, setEvents]);

  const gps = status?.gps ?? null;
  const battery = status?.batteryPct ?? null;
  const batteryTone = battery === null ? 'default' : battery < 20 ? 'bad' : battery < 40 ? 'warn' : 'ok';

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Robot"
        subtitle={status ? `Status ${timeAgo(status.timestamp, now)} (${formatTime(status.timestamp)})` : 'No robot status received yet'}
        right={<SimulationBadge source={status?.source} />}
      />
      <ErrorNote error={error} />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile label="Battery" value={formatPercent(battery)} tone={batteryTone} />
        <MetricTile label="Motor state" value={formatValue(status?.motorState)} />
        <MetricTile label="Leg state" value={formatValue(status?.legState)} />
        <MetricTile label="IMU" value={formatBool(status?.imuAvailable, 'AVAILABLE', 'UNAVAILABLE')} tone={status?.imuAvailable ? 'ok' : 'default'} />
        <MetricTile label="Movement" value={status?.moving === null || status?.moving === undefined ? '--' : status.moving ? 'MOVING' : 'STATIONARY'} />
        <MetricTile
          label="Robot connection"
          value={formatBool(status?.robotConnected, 'CONNECTED', 'DISCONNECTED')}
          tone={status ? (status.robotConnected ? 'ok' : 'bad') : 'default'}
        />
        <MetricTile label="SLAM status" value={formatValue(status?.slamStatus)} />
        <MetricTile
          label="GPS"
          value={gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : '--'}
          hint={gps ? `alt ${formatValue(gps.altitude, { unit: 'm' })} · acc ${formatValue(gps.accuracyM, { unit: 'm' })}` : 'No GPS fix'}
        />
        <MetricTile label="LiDAR" value={formatBool(status?.lidarAvailable, 'AVAILABLE', 'UNAVAILABLE')} tone={status?.lidarAvailable ? 'ok' : 'default'} />
        <MetricTile label="Active mission" value={missionLabel(missions, status?.activeMissionId)} tone="accent" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <MetricTile label="Phone" value={formatBool(status?.phoneConnected, 'ONLINE', 'OFFLINE')} tone={status ? (status.phoneConnected ? 'ok' : 'bad') : 'default'} />
        <MetricTile label="ESP32" value={formatBool(status?.esp32Connected, 'CONNECTED', 'DISCONNECTED')} tone={status ? (status.esp32Connected ? 'ok' : 'bad') : 'default'} />
        <MetricTile
          label="Thermal camera"
          value={formatBool(status?.thermalCameraConnected, 'CONNECTED', 'DISCONNECTED')}
          tone={status ? (status.thermalCameraConnected ? 'ok' : 'bad') : 'default'}
        />
        <MetricTile label="Extra fields" value={status && Object.keys(status.extra ?? {}).length > 0 ? String(Object.keys(status.extra).length) : '--'} />
      </div>
      {status && Object.keys(status.extra ?? {}).length > 0 ? (
        <Card title="Extra controller fields">
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            {Object.entries(status.extra).map(([k, v]) => (
              <div key={k}>
                <div className="hmi-label">{k}</div>
                <div className="num break-all text-text">{formatValue(v)}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <Card title="Robot events" right={<span className="hmi-label">{events.length}</span>}>
        {events.length === 0 ? (
          <EmptyState>No robot events</EmptyState>
        ) : (
          <ul className="flex flex-col text-xs">
            {events.map((ev, i) => {
              const { id, timestamp, type, message, source, ...rest } = ev;
              return (
                <li key={typeof id === 'string' ? id : i} className="flex flex-wrap items-center gap-2 border-b border-line/60 py-1.5 last:border-0">
                  <span className="num text-muted">{formatTime(typeof timestamp === 'string' ? timestamp : null)}</span>
                  <span className="hmi-label">{formatValue(type)}</span>
                  <span className="text-text">{formatValue(message)}</span>
                  <SimulationBadge source={typeof source === 'string' ? source : null} />
                  {Object.keys(rest).length > 0 ? <span className="num text-[10px] text-muted">{formatValue(rest)}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
