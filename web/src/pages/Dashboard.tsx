import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../components/Card';
import { LiveCanvas } from '../components/LiveCanvas';
import { EnvironmentSummary } from '../components/EnvironmentPanel';
import { StatusRow, boolDot } from '../components/StatusDot';
import { SeverityChip } from '../components/Chip';
import { SimulationBadge } from '../components/SimulationBadge';
import { useConnectionStore } from '../store/connection';
import { useRobotStore } from '../store/robot';
import { useAlertsStore } from '../store/alerts';
import { useMissionsStore, selectActiveMission } from '../store/missions';
import { useNow } from '../hooks/useNow';
import { formatBool, formatMissionNumber, formatTime, timeAgo } from '../lib/format';

export function DashboardPage() {
  const presence = useConnectionStore((s) => s.presence);
  const wsState = useConnectionStore((s) => s.wsState);
  const robot = useRobotStore((s) => s.status);
  const alerts = useAlertsStore((s) => s.alerts);
  const missions = useMissionsStore((s) => s.missions);
  const active = selectActiveMission(missions);
  const now = useNow(2000);
  const phone = presence ? presence.phoneConnected : robot?.phoneConnected ?? null;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Live overview of robot, environment and mission state" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Connections">
          <StatusRow label="Phone" state={boolDot(phone)} value={formatBool(phone, 'ONLINE', 'OFFLINE')} />
          <StatusRow label="ESP32" state={boolDot(robot?.esp32Connected)} value={formatBool(robot?.esp32Connected, 'CONNECTED', 'DISCONNECTED')} />
          <StatusRow
            label="Thermal camera"
            state={boolDot(robot?.thermalCameraConnected)}
            value={formatBool(robot?.thermalCameraConnected, 'CONNECTED', 'DISCONNECTED')}
          />
          <StatusRow label="Server WS" state={wsState === 'open' ? 'ok' : wsState === 'connecting' ? 'warn' : 'bad'} value={wsState.toUpperCase()} />
          <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
            <span>{robot ? `robot status ${timeAgo(robot.timestamp, now)}` : 'No robot status received'}</span>
            <SimulationBadge source={robot?.source} />
          </div>
        </Card>
        <Card title="Environment" right={<Link to="/sensors" className="hmi-label hover:text-thermal">Details</Link>}>
          <EnvironmentSummary />
        </Card>
        <Card title="Current mission" right={<Link to="/missions" className="hmi-label hover:text-thermal">Missions</Link>}>
          {active ? (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="num text-base font-semibold text-thermal">{formatMissionNumber(active.number)}</span>
                <SimulationBadge source={active.source} />
              </div>
              <div className="truncate text-text">{active.name}</div>
              <Row label="Start" value={formatTime(active.startTime)} />
              <Row label="Thermal images" value={String(active.stats.thermalImages)} />
              <Row label="RGB images" value={String(active.stats.rgbImages)} />
              <Row label="Videos" value={String(active.stats.videos)} />
              <Row label="Sensor readings" value={String(active.stats.sensorReadings)} />
              <Row label="Gas alerts" value={String(active.stats.gasAlerts)} />
              <Row label="Hotspots" value={String(active.stats.thermalHotspots)} />
              <Row label="Maps" value={String(active.stats.maps)} />
            </div>
          ) : (
            <div className="text-xs uppercase tracking-wider text-muted">No active mission</div>
          )}
        </Card>
        <Card title="Latest alerts" right={<Link to="/alerts" className="hmi-label hover:text-thermal">All</Link>}>
          {alerts.length === 0 ? (
            <div className="text-xs uppercase tracking-wider text-muted">No alerts</div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-xs">
                  <SeverityChip severity={a.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-text">{a.message}</div>
                    <div className="num text-[10px] text-muted">
                      {a.type} · {timeAgo(a.timestamp, now)}
                    </div>
                  </div>
                  <SimulationBadge source={a.source} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card title="Live thermal" right={<Link to="/thermal" className="hmi-label hover:text-thermal">Open</Link>} bodyClassName="p-2">
          <LiveCanvas channel="thermal" showTemps />
        </Card>
        <Card title="Live RGB" right={<Link to="/live" className="hmi-label hover:text-thermal">Open</Link>} bodyClassName="p-2">
          <LiveCanvas channel="rgb" />
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="hmi-label">{label}</span>
      <span className="num text-text">{value}</span>
    </div>
  );
}
