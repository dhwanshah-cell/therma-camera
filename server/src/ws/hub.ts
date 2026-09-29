import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import {
  alertSchema,
  decodeLiveFrame,
  encodeLiveFrame,
  missionSchema,
  robotStatusSchema,
  sensorReadingSchema,
  type LiveFrameHeader,
  type WsClientMessage,
  type WsRole,
  type WsServerMessage,
} from '@robodog/shared';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { Broadcaster, Ingest } from '../services/ingest.js';

type Channel = LiveFrameHeader['channel'];

const channelSchema = z.enum(['thermal', 'rgb']);
const commandSchema = z.enum(['capture_thermal', 'capture_rgb', 'start_recording', 'stop_recording']);

/** Runtime validation of shared WsClientMessage. */
const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), role: z.enum(['phone', 'web', 'robot']), deviceId: z.string().min(1), version: z.string().optional() }),
  z.object({ type: z.literal('subscribe'), channels: z.array(channelSchema) }),
  z.object({ type: z.literal('unsubscribe'), channels: z.array(channelSchema) }),
  z.object({ type: z.literal('ping'), t: z.number() }),
  z.object({ type: z.literal('sensor'), reading: sensorReadingSchema }),
  z.object({ type: z.literal('alert'), alert: alertSchema }),
  z.object({ type: z.literal('robot'), status: robotStatusSchema }),
  z.object({ type: z.literal('mission'), mission: missionSchema }),
  z.object({ type: z.literal('command'), command: commandSchema, requestId: z.string().min(1) }),
]);

interface Client {
  id: string;
  socket: WebSocket;
  role: WsRole | null;
  deviceId: string | null;
  subscriptions: Set<Channel>;
  /** Wall-clock ms of the last frame (text, binary or pong) received from this socket. */
  lastSeenAt: number;
}

interface CachedFrame {
  header: LiveFrameHeader;
  encoded: Buffer;
}

export interface HubOptions {
  simulation: boolean;
  /** How often to ping idle sockets. */
  heartbeatIntervalMs?: number;
  /** Sockets silent for longer than this are terminated. */
  deadAfterMs?: number;
}

/**
 * WebSocket hub implementing shared/src/ws.ts:
 *  - clients say `hello` with a role; the server answers `welcome`
 *  - phone text messages (sensor/alert/robot/mission) are persisted via Ingest and rebroadcast to web clients
 *  - phone binary frames (encodeLiveFrame) are cached per channel and relayed to subscribed web clients
 *  - web `command` messages are forwarded to every connected phone
 *  - `presence` is pushed to web clients whenever a phone connects or disconnects
 *  - ping/pong heartbeat terminates dead sockets
 */
export class Hub implements Broadcaster {
  private readonly clients = new Map<string, Client>();
  private readonly latestFrames = new Map<Channel, CachedFrame>();
  private ingest: Ingest | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly heartbeatIntervalMs: number;
  private readonly deadAfterMs: number;
  private _lastPhoneSeen: string | null = null;

  constructor(
    private readonly repos: Repositories,
    private readonly log: FastifyBaseLogger,
    private readonly options: HubOptions,
  ) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
    this.deadAfterMs = options.deadAfterMs ?? 30_000;
  }

  /** The ingest service depends on the hub for broadcasting, so it is attached after construction. */
  attachIngest(ingest: Ingest): void {
    this.ingest = ingest;
  }

  start(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => this.checkHeartbeats(), this.heartbeatIntervalMs);
    this.heartbeat.unref();
  }

  /**
   * Close every socket with 1001 (going away). Clients that do not finish the close handshake within
   * `graceMs` are terminated so server shutdown never waits on an unresponsive phone or browser.
   */
  stop(graceMs = 1000): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    const sockets = [...this.clients.values()].map((c) => c.socket);
    this.clients.clear();
    for (const socket of sockets) {
      try {
        socket.close(1001, 'server shutting down');
      } catch {
        /* ignore */
      }
    }
    const reaper = setTimeout(() => {
      for (const socket of sockets) {
        if (socket.readyState !== socket.CLOSED) socket.terminate();
      }
    }, graceMs);
    reaper.unref();
  }

  // ---- presence ------------------------------------------------------------------------------

  get phoneConnected(): boolean {
    for (const c of this.clients.values()) if (c.role === 'phone') return true;
    return false;
  }

  get lastPhoneSeen(): string | null {
    return this._lastPhoneSeen;
  }

  get webClientCount(): number {
    let n = 0;
    for (const c of this.clients.values()) if (c.role === 'web') n++;
    return n;
  }

  get clientCount(): number {
    return this.clients.size;
  }

  latestFrame(channel: Channel): LiveFrameHeader | null {
    return this.latestFrames.get(channel)?.header ?? null;
  }

  // ---- connection lifecycle -------------------------------------------------------------------

  handleConnection(socket: WebSocket, request: FastifyRequest): void {
    const client: Client = {
      id: randomUUID(),
      socket,
      role: null,
      deviceId: null,
      subscriptions: new Set(),
      lastSeenAt: Date.now(),
    };
    this.clients.set(client.id, client);
    this.log.debug({ clientId: client.id, ip: request.ip }, 'ws client connected');

    socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      client.lastSeenAt = Date.now();
      if (client.role === 'phone') this._lastPhoneSeen = new Date().toISOString();
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (isBinary) this.onBinary(client, buf);
      else this.onText(client, buf.toString('utf8'));
    });
    socket.on('pong', () => {
      client.lastSeenAt = Date.now();
    });
    socket.on('close', () => this.onClose(client));
    socket.on('error', (err: Error) => {
      this.log.warn({ clientId: client.id, err }, 'ws client error');
    });
  }

  private onClose(client: Client): void {
    if (!this.clients.delete(client.id)) return;
    this.log.debug({ clientId: client.id, role: client.role }, 'ws client disconnected');
    if (client.role === 'phone') {
      this._lastPhoneSeen = new Date().toISOString();
      this.repos.robot.addEvent('PHONE_DISCONNECTED', 'Phone disconnected from WebSocket', { deviceId: client.deviceId });
      this.broadcastPresence();
    }
  }

  private onText(client: Client, text: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      this.send(client, { type: 'error', message: 'invalid JSON' });
      return;
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.send(client, { type: 'error', message: `invalid message: ${parsed.error.issues.map((i) => i.message).join('; ')}` });
      return;
    }
    const msg = parsed.data as WsClientMessage;
    if (msg.type === 'hello') return this.onHello(client, msg);
    if (!client.role) {
      this.send(client, { type: 'error', message: 'send hello first' });
      return;
    }
    switch (msg.type) {
      case 'ping':
        this.send(client, { type: 'pong', t: msg.t });
        return;
      case 'subscribe':
        for (const ch of msg.channels) {
          client.subscriptions.add(ch);
          const cached = this.latestFrames.get(ch);
          if (cached) this.sendRaw(client, cached.encoded);
        }
        return;
      case 'unsubscribe':
        for (const ch of msg.channels) client.subscriptions.delete(ch);
        return;
      case 'command':
        return this.onCommand(client, msg);
      case 'sensor':
      case 'alert':
      case 'robot':
      case 'mission':
        return this.onDataMessage(client, msg);
    }
  }

  private onHello(client: Client, msg: Extract<WsClientMessage, { type: 'hello' }>): void {
    const wasPhone = client.role === 'phone';
    client.role = msg.role;
    client.deviceId = msg.deviceId;
    this.repos.devices.touch(msg.deviceId, msg.role, msg.version ?? null);
    this.send(client, { type: 'welcome', serverTime: new Date().toISOString(), simulation: this.options.simulation, clientId: client.id });
    if (msg.role === 'phone') {
      this._lastPhoneSeen = new Date().toISOString();
      if (!wasPhone) this.repos.robot.addEvent('PHONE_CONNECTED', 'Phone connected to WebSocket', { deviceId: msg.deviceId, version: msg.version ?? null });
      this.broadcastPresence();
    } else if (msg.role === 'web') {
      // Tell the new dashboard the current phone presence right away.
      this.send(client, this.presenceMessage());
    }
  }

  private onCommand(client: Client, msg: Extract<WsClientMessage, { type: 'command' }>): void {
    if (client.role !== 'web') {
      this.send(client, { type: 'error', message: 'only web clients can send commands' });
      return;
    }
    let delivered = 0;
    for (const c of this.clients.values()) {
      if (c.role === 'phone') {
        this.send(c, { type: 'command', command: msg.command, requestId: msg.requestId });
        delivered++;
      }
    }
    this.repos.robot.addEvent('COMMAND', `Command ${msg.command} forwarded to ${delivered} phone(s)`, { requestId: msg.requestId, delivered });
    if (delivered === 0) this.send(client, { type: 'error', message: `no phone connected to receive ${msg.command}` });
  }

  private onDataMessage(client: Client, msg: Extract<WsClientMessage, { type: 'sensor' | 'alert' | 'robot' | 'mission' }>): void {
    if (client.role === 'web') {
      this.send(client, { type: 'error', message: `web clients cannot publish ${msg.type} data` });
      return;
    }
    if (!this.ingest) {
      this.send(client, { type: 'error', message: 'server not ready' });
      return;
    }
    try {
      switch (msg.type) {
        case 'sensor':
          this.ingest.sensor(msg.reading);
          break;
        case 'alert':
          this.ingest.alert(msg.alert);
          break;
        case 'robot':
          this.ingest.robot(msg.status);
          break;
        case 'mission':
          this.ingest.upsertMission(msg.mission);
          break;
      }
    } catch (err) {
      this.log.error({ err, type: msg.type }, 'failed to persist ws message');
      this.send(client, { type: 'error', message: `failed to store ${msg.type}` });
    }
  }

  private onBinary(client: Client, buf: Buffer): void {
    if (client.role !== 'phone' && client.role !== 'robot') {
      this.send(client, { type: 'error', message: 'only phone/robot clients may send binary frames' });
      return;
    }
    const decoded = decodeLiveFrame(buf);
    if (!decoded || (decoded.header.channel !== 'thermal' && decoded.header.channel !== 'rgb')) {
      this.send(client, { type: 'error', message: 'malformed live frame' });
      return;
    }
    this.relayFrame(decoded.header, buf);
  }

  // ---- outbound ------------------------------------------------------------------------------

  /** Publish a live frame from server-side code (the simulator). Encodes, caches and relays it. */
  publishFrame(header: LiveFrameHeader, jpeg: Uint8Array): void {
    this.relayFrame(header, Buffer.from(encodeLiveFrame(header, jpeg)));
  }

  private relayFrame(header: LiveFrameHeader, encoded: Buffer): void {
    this.latestFrames.set(header.channel, { header, encoded });
    for (const c of this.clients.values()) {
      if (c.role === 'web' && c.subscriptions.has(header.channel)) this.sendRaw(c, encoded);
    }
  }

  broadcastToWeb(message: WsServerMessage): void {
    const text = JSON.stringify(message);
    for (const c of this.clients.values()) {
      if (c.role === 'web') this.sendText(c, text);
    }
  }

  presenceMessage(): Extract<WsServerMessage, { type: 'presence' }> {
    return { type: 'presence', phoneConnected: this.phoneConnected, webClients: this.webClientCount, lastPhoneSeen: this._lastPhoneSeen };
  }

  private broadcastPresence(): void {
    this.broadcastToWeb(this.presenceMessage());
  }

  private send(client: Client, message: WsServerMessage): void {
    this.sendText(client, JSON.stringify(message));
  }

  private sendText(client: Client, text: string): void {
    if (client.socket.readyState !== client.socket.OPEN) return;
    client.socket.send(text, (err) => {
      if (err) this.log.debug({ clientId: client.id, err }, 'ws send failed');
    });
  }

  private sendRaw(client: Client, data: Buffer): void {
    if (client.socket.readyState !== client.socket.OPEN) return;
    client.socket.send(data, { binary: true }, (err) => {
      if (err) this.log.debug({ clientId: client.id, err }, 'ws binary send failed');
    });
  }

  private checkHeartbeats(): void {
    const now = Date.now();
    for (const client of this.clients.values()) {
      if (now - client.lastSeenAt > this.deadAfterMs) {
        this.log.info({ clientId: client.id, role: client.role }, 'terminating dead ws client');
        client.socket.terminate();
        this.onClose(client);
        continue;
      }
      if (client.socket.readyState === client.socket.OPEN) client.socket.ping();
    }
  }
}
