import { useState } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRobotStore } from '../store/robot';
import { StatusDot, boolDot, type DotState } from './StatusDot';
import { SimulationBanner } from './SimulationBadge';
import { MobileMenu } from './Nav';
import { useNow } from '../hooks/useNow';
import { timeAgo } from '../lib/format';

function wsDot(state: string): DotState {
  if (state === 'open') return 'ok';
  if (state === 'connecting') return 'warn';
  return 'bad';
}

function Indicator({ label, state, title }: { label: string; state: DotState; title?: string }) {
  return (
    <div className="flex items-center gap-1.5" title={title}>
      <StatusDot state={state} pulse={state === 'ok'} />
      <span className="hmi-label hidden sm:inline">{label}</span>
    </div>
  );
}

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const wsState = useConnectionStore((s) => s.wsState);
  const lastError = useConnectionStore((s) => s.lastError);
  const presence = useConnectionStore((s) => s.presence);
  const simulation = useConnectionStore((s) => s.simulation);
  const robot = useRobotStore((s) => s.status);
  const now = useNow(2000);

  const phoneState: DotState = presence ? (presence.phoneConnected ? 'ok' : 'bad') : boolDot(robot?.phoneConnected);
  const phoneTitle = presence?.lastPhoneSeen ? `Phone last seen ${timeAgo(presence.lastPhoneSeen, now)}` : 'Phone presence unknown';

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel">
      <div className="flex items-center justify-between gap-3 px-3 py-2 lg:px-4">
        <div className="flex items-center gap-3">
          <button className="btn px-2 lg:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle menu" aria-expanded={menuOpen}>
            {menuOpen ? '✕' : '☰'}
          </button>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-black tracking-[0.2em] text-thermal">ROBO-DOG</span>
            <span className="hidden text-[10px] font-semibold uppercase tracking-[0.24em] text-muted sm:inline">Command Center</span>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4">
          <Indicator label="Phone" state={phoneState} title={phoneTitle} />
          <Indicator label="ESP32" state={boolDot(robot?.esp32Connected)} title="ESP32 sensor board (from latest robot status)" />
          <Indicator label="Thermal" state={boolDot(robot?.thermalCameraConnected)} title="Thermal camera (from latest robot status)" />
          <Indicator
            label={wsState === 'open' ? 'Server WS' : wsState === 'connecting' ? 'Connecting' : 'WS Offline'}
            state={wsDot(wsState)}
            title={lastError ?? `WebSocket ${wsState}`}
          />
        </div>
      </div>
      <SimulationBanner active={simulation === true} />
      {menuOpen ? <MobileMenu onNavigate={() => setMenuOpen(false)} /> : null}
    </header>
  );
}
