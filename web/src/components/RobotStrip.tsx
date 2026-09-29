import { useRobotStore } from '../store/robot';
import { useConnectionStore } from '../store/connection';
import { useMissionsStore, missionLabel } from '../store/missions';
import { useNow } from '../hooks/useNow';
import { formatBool, formatPercent, formatValue, timeAgo } from '../lib/format';
import { StatusDot, boolDot } from './StatusDot';
import { SimulationBadge } from './SimulationBadge';

function Item({ label, value, dot }: { label: string; value: string; dot?: boolean | null }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {dot !== undefined ? <StatusDot state={boolDot(dot)} /> : null}
      <span className="hmi-label">{label}</span>
      <span className="num text-xs text-text">{value}</span>
    </div>
  );
}

/** Compact one-line robot status strip. All null fields render as "--". */
export function RobotStrip() {
  const status = useRobotStore((s) => s.status);
  const presence = useConnectionStore((s) => s.presence);
  const missions = useMissionsStore((s) => s.missions);
  const now = useNow(2000);
  const phone = presence ? presence.phoneConnected : status?.phoneConnected ?? null;
  return (
    <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2">
      <Item label="Phone" value={formatBool(phone, 'ONLINE', 'OFFLINE')} dot={phone} />
      <Item label="ESP32" value={formatBool(status?.esp32Connected, 'CONNECTED', 'DISCONNECTED')} dot={status?.esp32Connected ?? null} />
      <Item label="Thermal cam" value={formatBool(status?.thermalCameraConnected, 'CONNECTED', 'DISCONNECTED')} dot={status?.thermalCameraConnected ?? null} />
      <Item label="Robot link" value={formatBool(status?.robotConnected, 'CONNECTED', 'DISCONNECTED')} dot={status?.robotConnected ?? null} />
      <Item label="Battery" value={formatPercent(status?.batteryPct)} />
      <Item label="Motor" value={formatValue(status?.motorState)} />
      <Item label="Moving" value={formatBool(status?.moving)} />
      <Item label="Mission" value={missionLabel(missions, status?.activeMissionId)} />
      <div className="ml-auto flex items-center gap-2">
        <SimulationBadge source={status?.source} />
        <span className="text-[10px] text-muted">{status ? `status ${timeAgo(status.timestamp, now)}` : 'No robot status yet'}</span>
      </div>
    </div>
  );
}
