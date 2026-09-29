import { useSensorsStore } from '../store/sensors';
import { useNow } from '../hooks/useNow';
import { GAS_RAW_UNIT_LABEL, formatGasRaw, formatHumidity, formatTemperature, gasStatusLabel, timeAgo } from '../lib/format';
import { MetricTile } from './MetricTile';
import { SimulationBadge } from './SimulationBadge';

/** Environmental (DHT11 + MQ gas) values from the latest sensor reading. Nulls render as "--". */
export function EnvironmentTiles({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const latest = useSensorsStore((s) => s.latest);
  const now = useNow(1000);
  const gasTone = latest ? (latest.gasAlert ? 'bad' : 'ok') : 'default';
  return (
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
      <MetricTile
        label="Temperature"
        value={formatTemperature(latest?.temperatureC)}
        hint="DHT11 environmental temperature"
        size={size}
        badge={<SimulationBadge source={latest?.source} />}
      />
      <MetricTile label="Humidity" value={formatHumidity(latest?.humidityPct)} hint="DHT11 relative humidity" size={size} />
      <MetricTile label="Gas raw" value={formatGasRaw(latest?.gasRaw)} unit={GAS_RAW_UNIT_LABEL} hint="MQ sensor raw ADC value (uncalibrated)" size={size} />
      <MetricTile
        label="Gas status"
        value={gasStatusLabel(latest ? latest.gasAlert : null)}
        tone={gasTone}
        hint={latest ? `updated ${timeAgo(latest.timestamp, now)}` : 'Waiting for sensor'}
        size={size}
      />
    </div>
  );
}

export function EnvironmentSummary() {
  const latest = useSensorsStore((s) => s.latest);
  const now = useNow(1000);
  if (!latest) return <div className="text-xs uppercase tracking-wider text-muted">Waiting for sensor</div>;
  return (
    <div className="flex flex-col gap-1 text-xs">
      <Row label="Temperature" value={formatTemperature(latest.temperatureC)} />
      <Row label="Humidity" value={formatHumidity(latest.humidityPct)} />
      <Row
        label="Gas"
        value={`${gasStatusLabel(latest.gasAlert)}  (raw ${formatGasRaw(latest.gasRaw)})`}
        tone={latest.gasAlert ? 'bad' : 'ok'}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-muted">updated {timeAgo(latest.timestamp, now)}</span>
        <SimulationBadge source={latest.source} />
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const c = tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : 'text-text';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="hmi-label">{label}</span>
      <span className={`num ${c}`}>{value}</span>
    </div>
  );
}
