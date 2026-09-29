import { useState } from 'react';
import { DEV_API_TOKEN, TC01A, ESP32 } from '@robodog/shared';
import { Card, PageHeader } from '../components/Card';
import { applySettingsAndReconnect } from '../app/bootstrap';
import { wsClient } from '../api/ws';
import { clearSettings, getApiBase, getSettings, getToken, getWsUrl, saveSettings } from '../lib/config';
import { useConnectionStore } from '../store/connection';
import { formatTime, formatValue } from '../lib/format';

function mask(token: string): string {
  if (token.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, token.length - 4))}${token.slice(-4)}`;
}

export function SettingsPage() {
  const initial = getSettings();
  const [apiBase, setApiBase] = useState(initial.apiBase);
  const [wsUrl, setWsUrl] = useState(initial.wsUrl);
  const [token, setToken] = useState(initial.token);
  const [reveal, setReveal] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const wsState = useConnectionStore((s) => s.wsState);
  const lastError = useConnectionStore((s) => s.lastError);
  const attempt = useConnectionStore((s) => s.reconnectAttempt);
  const health = useConnectionStore((s) => s.health);
  const clientId = useConnectionStore((s) => s.clientId);

  const effectiveToken = getToken();

  const save = () => {
    saveSettings({ apiBase, wsUrl, token });
    applySettingsAndReconnect();
    setSaved(`Saved and reconnecting (${formatTime(new Date().toISOString())})`);
  };
  const reset = () => {
    clearSettings();
    setApiBase('');
    setWsUrl('');
    setToken('');
    applySettingsAndReconnect();
    setSaved('Reset to defaults');
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Settings" subtitle="Runtime overrides are stored in this browser (localStorage) and never sent anywhere except the RoboDog server" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Server" bodyClassName="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="hmi-label">Server URL (REST base)</span>
            <input className="input" placeholder="(same origin via dev proxy)" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
            <span className="text-[10px] text-muted">
              Effective: <span className="num text-text">{getApiBase() || '(same origin)'}</span>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="hmi-label">WebSocket URL</span>
            <input className="input" placeholder="(derived from server URL / page location)" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} />
            <span className="text-[10px] text-muted">
              Effective: <span className="num text-text">{getWsUrl()}</span>
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="hmi-label">API token</span>
            <div className="flex gap-2">
              <input
                className="input"
                type={reveal ? 'text' : 'password'}
                placeholder={`(default ${mask(DEV_API_TOKEN)})`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="off"
              />
              <button className="btn" onClick={() => setReveal((r) => !r)}>
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
            <span className="text-[10px] text-muted">
              Effective: <span className="num text-text">{reveal ? effectiveToken : mask(effectiveToken)}</span>
              {effectiveToken === DEV_API_TOKEN ? <span className="ml-2 text-sim">development default token in use</span> : null}
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-accent" onClick={save}>
              Save & reconnect
            </button>
            <button className="btn" onClick={reset}>
              Reset to defaults
            </button>
            {saved ? <span className="text-[10px] text-muted">{saved}</span> : null}
          </div>
        </Card>
        <div className="flex flex-col gap-3">
          <Card title="WebSocket" bodyClassName="flex flex-col gap-2 text-xs">
            <KV k="State" v={wsState.toUpperCase()} />
            <KV k="Reconnect attempt" v={String(attempt)} />
            <KV k="Client id" v={formatValue(clientId)} />
            <KV k="Last error" v={formatValue(lastError)} />
            <div>
              <button className="btn" onClick={() => wsClient.reconnect()}>
                Reconnect now
              </button>
            </div>
          </Card>
          <Card title="Server health" bodyClassName="flex flex-col gap-1 text-xs">
            <KV k="Status" v={formatValue(health?.status)} />
            <KV k="Version" v={formatValue(health?.version)} />
            <KV k="Simulation" v={health ? (health.simulation ? 'ON' : 'OFF') : '--'} />
            <KV k="Uptime" v={formatValue(health?.uptimeSeconds, { unit: 's' })} />
            <KV k="Server time" v={formatTime(health?.time)} />
          </Card>
          <Card title="Theme" bodyClassName="text-xs text-muted">
            Dark robotics control theme only. Colours: thermal accent #ff7a1a, OK #22c55e, fault #ef4444, simulation #f59e0b.
          </Card>
          <Card title="About" bodyClassName="flex flex-col gap-1 text-xs text-muted">
            <div>ROBO-DOG Command Center v0.1.0 — web dashboard for the RoboDog search-and-rescue robot.</div>
            <div>
              Thermal camera: {TC01A.MODEL} ({TC01A.THERMAL_WIDTH}x{TC01A.THERMAL_HEIGHT}). Sensor board: ESP32 on SSID {ESP32.SSID}.
            </div>
            <div>Values are shown exactly as reported by the server; missing values render as "--". Simulated data is always labelled.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="hmi-label">{k}</span>
      <span className="num break-all text-right text-text">{v}</span>
    </div>
  );
}
