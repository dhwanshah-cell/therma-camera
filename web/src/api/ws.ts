import { decodeLiveFrame, type WsClientMessage, type WsServerMessage } from '@robodog/shared';
import { getDeviceId, getToken, getWsUrl } from '../lib/config';
import { useAlertsStore } from '../store/alerts';
import { useConnectionStore } from '../store/connection';
import { useLiveFramesStore } from '../store/liveFrames';
import { useMediaStore } from '../store/media';
import { useMissionsStore } from '../store/missions';
import { useRobotStore } from '../store/robot';
import { useSensorsStore } from '../store/sensors';

export type WsCommand = Extract<WsClientMessage, { type: 'command' }>['command'];

const SUBSCRIBE_CHANNELS: Array<'thermal' | 'rgb'> = ['thermal', 'rgb'];
const PING_INTERVAL_MS = 15000;
const MAX_BACKOFF_MS = 15000;

/**
 * Handle one binary WebSocket frame: decode the live frame envelope and push it into the store.
 * Exported separately so it can be unit tested without a socket. Returns false for invalid data.
 */
export function handleBinaryFrame(data: Uint8Array, receivedAt: number = Date.now()): boolean {
  const decoded = decodeLiveFrame(data);
  if (!decoded) return false;
  const { header, jpeg } = decoded;
  if (header.channel !== 'thermal' && header.channel !== 'rgb') return false;
  // Copy the JPEG out of the shared socket buffer so it stays valid after the event.
  useLiveFramesStore.getState().setFrame(header.channel, header, new Uint8Array(jpeg), receivedAt);
  return true;
}

/** Route a JSON server message into the matching store. */
export function handleServerMessage(msg: WsServerMessage): void {
  switch (msg.type) {
    case 'welcome':
      useConnectionStore.getState().setWelcome({ clientId: msg.clientId, serverTime: msg.serverTime, simulation: msg.simulation });
      break;
    case 'pong':
      useConnectionStore.getState().setLastPong(Date.now());
      break;
    case 'sensor':
      useSensorsStore.getState().addReading(msg.reading);
      break;
    case 'alert':
      useAlertsStore.getState().upsertAlert(msg.alert);
      break;
    case 'robot':
      useRobotStore.getState().setStatus(msg.status);
      break;
    case 'mission':
      useMissionsStore.getState().upsertMission(msg.mission);
      break;
    case 'media': {
      const media = useMediaStore.getState();
      if (msg.mediaType === 'THERMAL_IMAGE') media.upsertThermalImage(msg.item);
      else if (msg.mediaType === 'RGB_IMAGE') media.upsertRgbImage(msg.item);
      else if (msg.mediaType === 'VIDEO') media.upsertVideo(msg.item);
      else if (msg.mediaType === 'THERMAL_MAP') media.upsertMap(msg.item);
      break;
    }
    case 'presence':
      useConnectionStore
        .getState()
        .setPresence({ phoneConnected: msg.phoneConnected, webClients: msg.webClients, lastPhoneSeen: msg.lastPhoneSeen });
      break;
    case 'error':
      useConnectionStore.getState().setWsState('open', msg.message);
      break;
    case 'command':
      // Commands are addressed to the phone; the web client ignores echoes.
      break;
    default:
      break;
  }
}

export class RoboDogWs {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private requestCounter = 0;

  get isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.stopped = false;
    this.open();
  }

  /** Close and reconnect immediately (used after settings changes). */
  reconnect(): void {
    this.disconnect();
    this.attempt = 0;
    this.connect();
  }

  disconnect(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      s.onopen = null;
      s.onmessage = null;
      s.onerror = null;
      s.onclose = null;
      try {
        s.close();
      } catch {
        /* ignore */
      }
    }
    useConnectionStore.getState().setWsState('closed');
  }

  send(msg: WsClientMessage): boolean {
    if (!this.isOpen || !this.socket) return false;
    try {
      this.socket.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Send a capture/recording command to the phone. Returns the requestId, or null when not connected. */
  sendCommand(command: WsCommand): string | null {
    this.requestCounter += 1;
    const requestId = `${getDeviceId()}-${Date.now()}-${this.requestCounter}`;
    return this.send({ type: 'command', command, requestId }) ? requestId : null;
  }

  private open(): void {
    if (this.stopped) return;
    this.clearTimers();
    const store = useConnectionStore.getState();
    store.setWsState('connecting');
    store.setReconnectAttempt(this.attempt);
    let url: string;
    try {
      const base = getWsUrl();
      const sep = base.includes('?') ? '&' : '?';
      url = `${base}${sep}token=${encodeURIComponent(getToken())}`;
    } catch (e) {
      store.setWsState('error', e instanceof Error ? e.message : 'Invalid WebSocket URL');
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      store.setWsState('error', e instanceof Error ? e.message : 'WebSocket failed');
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.socket = ws;

    ws.onopen = () => {
      this.attempt = 0;
      useConnectionStore.getState().setWsState('open');
      useConnectionStore.getState().setReconnectAttempt(0);
      this.send({ type: 'hello', role: 'web', deviceId: getDeviceId(), version: '0.1.0' });
      this.send({ type: 'subscribe', channels: SUBSCRIBE_CHANNELS });
      this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), PING_INTERVAL_MS);
    };

    ws.onmessage = (ev: MessageEvent) => {
      const data: unknown = ev.data;
      if (data instanceof ArrayBuffer) {
        handleBinaryFrame(new Uint8Array(data));
        return;
      }
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        void data.arrayBuffer().then((buf) => handleBinaryFrame(new Uint8Array(buf)));
        return;
      }
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data) as WsServerMessage;
          if (msg && typeof msg === 'object' && typeof msg.type === 'string') handleServerMessage(msg);
        } catch {
          /* ignore malformed message */
        }
      }
    };

    ws.onerror = () => {
      useConnectionStore.getState().setWsState('error', 'WebSocket error');
    };

    ws.onclose = (ev: CloseEvent) => {
      if (this.socket === ws) this.socket = null;
      this.clearTimers();
      if (this.stopped) return;
      const reason = ev.code === 1008 || ev.code === 4001 ? 'Unauthorized (check API token)' : ev.reason || `closed (${ev.code})`;
      useConnectionStore.getState().setWsState('closed', reason);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.attempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(this.attempt, 5));
    useConnectionStore.getState().setReconnectAttempt(this.attempt);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearTimers(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Application-wide singleton. */
export const wsClient = new RoboDogWs();
