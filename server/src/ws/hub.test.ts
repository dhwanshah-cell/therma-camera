import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { decodeLiveFrame, encodeLiveFrame, type LiveFrameHeader, type WsServerMessage } from '@robodog/shared';
import { robotStatus, sensorReading } from '../test/fixtures.js';
import { connectWs, createTestApp, TINY_JPEG, type TestApp } from '../test/helpers.js';

describe('websocket hub', () => {
  let t: TestApp;
  let baseUrl: string;
  beforeAll(async () => {
    t = await createTestApp();
    baseUrl = await t.listen();
  });
  afterAll(() => t.close());

  it('rejects connections without a valid token', async () => {
    const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws');
    const outcome = await new Promise<string>((resolve) => {
      socket.once('open', () => resolve('open'));
      socket.once('error', () => resolve('error'));
      socket.once('unexpected-response', (req, res) => {
        // With a listener attached, ws leaves the request to us: drain and abort it.
        res.resume();
        req.destroy();
        resolve(`status ${res.statusCode}`);
      });
    });
    expect(outcome).toBe('status 401');
  });

  it('answers hello with welcome, pings with pong and rejects messages before hello', async () => {
    const web = await connectWs(baseUrl);
    web.send({ type: 'subscribe', channels: ['thermal'] });
    const err = await web.next((m) => m.type === 'error');
    expect(err.type).toBe('error');

    web.send({ type: 'hello', role: 'web', deviceId: 'web-test', version: '1' });
    const welcome = await web.next<Extract<WsServerMessage, { type: 'welcome' }>>((m) => m.type === 'welcome');
    expect(welcome.simulation).toBe(false);
    expect(typeof welcome.clientId).toBe('string');
    expect(new Date(welcome.serverTime).toISOString()).toBe(welcome.serverTime);

    const initialPresence = await web.next<Extract<WsServerMessage, { type: 'presence' }>>((m) => m.type === 'presence');
    expect(initialPresence.phoneConnected).toBe(false);

    web.send({ type: 'ping', t: 42 });
    const pong = await web.next((m) => m.type === 'pong');
    expect(pong).toEqual({ type: 'pong', t: 42 });
    await web.close();
  });

  it('relays phone data and binary frames to web clients, tracks presence and forwards commands', async () => {
    const web = await connectWs(baseUrl);
    web.send({ type: 'hello', role: 'web', deviceId: 'web-1' });
    await web.next((m) => m.type === 'welcome');
    await web.next((m) => m.type === 'presence');
    web.send({ type: 'subscribe', channels: ['thermal'] });

    const phone = await connectWs(baseUrl);
    phone.send({ type: 'hello', role: 'phone', deviceId: 'phone-1', version: '0.1' });
    await phone.next((m) => m.type === 'welcome');

    const presence = await web.next<Extract<WsServerMessage, { type: 'presence' }>>((m) => m.type === 'presence' && m.phoneConnected);
    expect(presence.phoneConnected).toBe(true);
    expect(presence.webClients).toBe(1);
    expect(presence.lastPhoneSeen).not.toBeNull();
    expect(t.app.hub.phoneConnected).toBe(true);
    const robotView = await t.app.inject({ method: 'GET', url: '/api/robot', headers: t.headers });
    expect(robotView.json().phoneConnected).toBe(true);

    // Sensor from the phone: persisted and relayed.
    const reading = sensorReading({ id: 'sensor_ws' });
    phone.send({ type: 'sensor', reading });
    const relayed = await web.next<Extract<WsServerMessage, { type: 'sensor' }>>((m) => m.type === 'sensor');
    expect(relayed.reading).toEqual(reading);
    expect(t.app.repos.sensors.get('sensor_ws')).toEqual(reading);

    // Sending it again is deduplicated: no second broadcast.
    phone.send({ type: 'sensor', reading });
    phone.send({ type: 'robot', status: robotStatus({ batteryPct: 42 }) });
    const robotMsg = await web.next<Extract<WsServerMessage, { type: 'robot' }>>((m) => m.type === 'robot' || m.type === 'sensor');
    expect(robotMsg.type).toBe('robot');
    expect(robotMsg.status.batteryPct).toBe(42);

    // Binary thermal frame relayed to the subscribed web client.
    const header: LiveFrameHeader = {
      channel: 'thermal',
      timestamp: new Date().toISOString(),
      frameId: 'f1',
      width: 256,
      height: 192,
      palette: 'IRON',
      radiometric: false,
      source: 'REAL',
    };
    phone.socket.send(encodeLiveFrame(header, TINY_JPEG), { binary: true });
    const frame = await web.nextBinary();
    const decoded = decodeLiveFrame(frame);
    expect(decoded?.header).toEqual(header);
    expect(Buffer.from(decoded!.jpeg).equals(TINY_JPEG)).toBe(true);

    // A late web client gets the cached last frame on subscribe.
    const late = await connectWs(baseUrl);
    late.send({ type: 'hello', role: 'web', deviceId: 'web-2' });
    await late.next((m) => m.type === 'welcome');
    late.send({ type: 'subscribe', channels: ['thermal', 'rgb'] });
    const cached = decodeLiveFrame(await late.nextBinary());
    expect(cached?.header.frameId).toBe('f1');
    expect(t.app.hub.latestFrame('thermal')?.frameId).toBe('f1');
    expect(t.app.hub.latestFrame('rgb')).toBeNull();

    // Unsubscribed clients do not receive frames.
    late.send({ type: 'unsubscribe', channels: ['thermal'] });
    await new Promise((r) => setTimeout(r, 50));
    phone.socket.send(encodeLiveFrame({ ...header, frameId: 'f2' }, TINY_JPEG), { binary: true });
    expect(decodeLiveFrame(await web.nextBinary())?.header.frameId).toBe('f2');
    await expect(late.nextBinary(200)).rejects.toThrow(/timed out/);

    // Command from web reaches the phone.
    web.send({ type: 'command', command: 'capture_thermal', requestId: 'req-1' });
    const command = await phone.next((m) => m.type === 'command');
    expect(command).toEqual({ type: 'command', command: 'capture_thermal', requestId: 'req-1' });

    // Web clients cannot publish data.
    late.send({ type: 'sensor', reading: sensorReading() });
    expect((await late.next((m) => m.type === 'error')).type).toBe('error');

    // Phone disconnect -> presence false.
    await phone.close();
    const gone = await web.next<Extract<WsServerMessage, { type: 'presence' }>>((m) => m.type === 'presence' && !m.phoneConnected);
    expect(gone.phoneConnected).toBe(false);
    expect(gone.lastPhoneSeen).not.toBeNull();
    expect(t.app.hub.phoneConnected).toBe(false);

    // Command with no phone connected yields an error.
    web.send({ type: 'command', command: 'capture_rgb', requestId: 'req-2' });
    expect((await web.next((m) => m.type === 'error')).type).toBe('error');

    const events = (await t.app.inject({ method: 'GET', url: '/api/robot/events', headers: t.headers })).json();
    expect(events.map((e: { kind: string }) => e.kind)).toEqual(expect.arrayContaining(['PHONE_CONNECTED', 'PHONE_DISCONNECTED', 'COMMAND']));

    await web.close();
    await late.close();
  });

  it('terminates silent sockets after the dead timeout', async () => {
    const quick = await createTestApp({}, { hub: { heartbeatIntervalMs: 50, deadAfterMs: 120 } });
    const url = await quick.listen();
    // autoPong: false stops the client answering pings, so the server sees a dead client.
    const socket = new WebSocket(url.replace(/^http/, 'ws') + '/ws?token=test-token-123', { autoPong: false });
    await new Promise<void>((resolve) => socket.once('open', () => resolve()));
    expect(quick.app.hub.clientCount).toBe(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(quick.app.hub.clientCount).toBe(0);
    socket.terminate();
    await quick.close();
  });
});
