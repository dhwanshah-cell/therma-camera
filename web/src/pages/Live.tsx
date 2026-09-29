import { PageHeader } from '../components/Card';
import { LiveCanvas } from '../components/LiveCanvas';
import { EnvironmentTiles } from '../components/EnvironmentPanel';
import { RobotStrip } from '../components/RobotStrip';
import { CaptureButtons } from '../components/CaptureButtons';

export function LivePage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Live"
        subtitle="Thermal + RGB streams relayed from the phone"
        right={<CaptureButtons commands={['capture_thermal', 'capture_rgb', 'start_recording', 'stop_recording']} />}
      />
      <RobotStrip />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LiveCanvas channel="thermal" showTemps className="w-full" />
        <LiveCanvas channel="rgb" className="w-full" />
      </div>
      <EnvironmentTiles />
    </div>
  );
}
