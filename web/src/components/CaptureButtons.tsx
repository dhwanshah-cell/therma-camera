import { useState } from 'react';
import { wsClient, type WsCommand } from '../api/ws';
import { useConnectionStore } from '../store/connection';

const LABELS: Record<WsCommand, string> = {
  capture_thermal: 'Capture thermal',
  capture_rgb: 'Capture RGB',
  start_recording: 'Start recording',
  stop_recording: 'Stop recording',
};

export function CaptureButtons({ commands }: { commands: WsCommand[] }) {
  const wsState = useConnectionStore((s) => s.wsState);
  const [last, setLast] = useState<string | null>(null);
  const send = (c: WsCommand) => {
    const id = wsClient.sendCommand(c);
    setLast(id ? `Sent ${LABELS[c]} (${id.slice(-6)})` : 'Not connected: command not sent');
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {commands.map((c) => (
        <button key={c} className={`btn ${c.startsWith('capture') ? 'btn-accent' : ''}`} disabled={wsState !== 'open'} onClick={() => send(c)}>
          {LABELS[c]}
        </button>
      ))}
      {last ? <span className="text-[10px] text-muted">{last}</span> : null}
    </div>
  );
}
