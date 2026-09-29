import { Card, PageHeader } from '../components/Card';
import { EnvironmentTiles } from '../components/EnvironmentPanel';
import { SensorChart } from '../components/SensorChart';
import { Chip } from '../components/Chip';
import { SimulationBadge } from '../components/SimulationBadge';
import { useSensorsStore } from '../store/sensors';
import { useRobotStore } from '../store/robot';
import { ESP32 } from '@robodog/shared';
import { formatPosition, formatTime } from '../lib/format';

export function SensorsPage() {
  const latest = useSensorsStore((s) => s.latest);
  const readings = useSensorsStore((s) => s.readings);
  const robot = useRobotStore((s) => s.status);
  const esp = robot?.esp32Connected;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Sensors"
        subtitle={`ESP32 sensor board at ${ESP32.BASE_URL} polled by the phone every ${ESP32.POLL_INTERVAL_MS} ms`}
        right={
          <>
            <Chip tone={esp === true ? 'ok' : esp === false ? 'bad' : 'muted'}>
              ESP32 {esp === true ? 'connected' : esp === false ? 'disconnected' : 'unknown'}
            </Chip>
            <SimulationBadge source={latest?.source} />
          </>
        }
      />
      <section>
        <div className="mb-2 flex items-center gap-2">
          <span className="hmi-title">Environmental Temperature</span>
          <span className="hmi-label">DHT11 + MQ gas sensor</span>
        </div>
        <EnvironmentTiles size="lg" />
      </section>
      <Card title="History" right={<span className="hmi-label">last {Math.min(readings.length, 120)} readings</span>}>
        <SensorChart readings={readings} limit={120} />
      </Card>
      <Card title="Latest reading">
        {latest ? (
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <Field label="Timestamp" value={formatTime(latest.timestamp)} />
            <Field label="Reading id" value={latest.id} />
            <Field label="Mission" value={latest.missionId ?? '--'} />
            <Field label="Position" value={latest.position ? `${formatPosition(latest.position)} (${latest.position.frame})` : '--'} />
          </div>
        ) : (
          <div className="text-xs uppercase tracking-wider text-muted">Waiting for sensor</div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="hmi-label">{label}</div>
      <div className="num break-all text-text">{value}</div>
    </div>
  );
}
