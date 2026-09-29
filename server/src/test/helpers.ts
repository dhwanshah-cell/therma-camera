import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { AUTH_HEADER, type WsServerMessage } from '@robodog/shared';
import WebSocket from 'ws';
import { buildApp, type BuildOptions } from '../app.js';
import type { Config } from '../config.js';

export const TEST_TOKEN = 'test-token-123';

export interface TestApp {
  app: FastifyInstance;
  config: Config;
  mediaDir: string;
  /** Auth header for inject calls. */
  headers: Record<string, string>;
  /** Start listening on an ephemeral port; returns the base http URL. */
  listen(): Promise<string>;
  close(): Promise<void>;
}

/** Hermetic app: in-memory SQLite, temporary media directory, silent logs. */
export async function createTestApp(overrides: Partial<Config> = {}, options: BuildOptions = {}): Promise<TestApp> {
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robodog-media-'));
  const config: Config = {
    port: 0,
    host: '127.0.0.1',
    apiToken: TEST_TOKEN,
    usingDefaultToken: false,
    dbPath: ':memory:',
    mediaDir,
    simulation: false,
    corsOrigin: '*',
    logLevel: 'silent',
    ...overrides,
  };
  const app = await buildApp(config, options);
  let listening = false;
  return {
    app,
    config,
    mediaDir,
    headers: { [AUTH_HEADER]: TEST_TOKEN },
    async listen() {
      if (!listening) {
        await app.listen({ port: 0, host: '127.0.0.1' });
        listening = true;
      } else {
        await app.ready();
      }
      const address = app.server.address();
      if (!address || typeof address === 'string') throw new Error('no address');
      return `http://127.0.0.1:${address.port}`;
    },
    async close() {
      await app.close();
      fs.rmSync(mediaDir, { recursive: true, force: true });
    },
  };
}

/** Build a multipart/form-data body by hand so tests do not need extra dependencies. */
export function multipartBody(parts: Array<{ name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }>): {
  body: Buffer;
  contentType: string;
} {
  const boundary = `----robodog${Math.random().toString(36).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`));
      chunks.push(Buffer.from(`Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`));
      chunks.push(part.data ?? Buffer.alloc(0));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
      chunks.push(Buffer.from(part.value ?? ''));
    }
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** Minimal valid baseline JPEG (1x1 pixel) for upload tests. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

// ---- websocket helpers ------------------------------------------------------------------------

export interface WsClient {
  socket: WebSocket;
  /** Wait for the next text message satisfying the predicate. */
  next<T extends WsServerMessage = WsServerMessage>(predicate?: (msg: WsServerMessage) => boolean, timeoutMs?: number): Promise<T>;
  /** Wait for the next binary frame. */
  nextBinary(timeoutMs?: number): Promise<Buffer>;
  send(msg: unknown): void;
  close(): Promise<void>;
}

export async function connectWs(baseUrl: string, token: string | null = TEST_TOKEN): Promise<WsClient> {
  const url = baseUrl.replace(/^http/, 'ws') + '/ws' + (token ? `?token=${encodeURIComponent(token)}` : '');
  const socket = new WebSocket(url);
  const texts: WsServerMessage[] = [];
  const binaries: Buffer[] = [];
  const waiters: Array<() => void> = [];
  const notify = (): void => {
    for (const w of waiters.splice(0)) w();
  };
  socket.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (isBinary) binaries.push(buf);
    else texts.push(JSON.parse(buf.toString('utf8')) as WsServerMessage);
    notify();
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  const waitFor = <T>(take: () => T | undefined, timeoutMs: number, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), timeoutMs);
      const check = (): void => {
        const v = take();
        if (v !== undefined) {
          clearTimeout(deadline);
          resolve(v);
        } else {
          waiters.push(check);
        }
      };
      check();
    });

  return {
    socket,
    next<T extends WsServerMessage = WsServerMessage>(predicate: (msg: WsServerMessage) => boolean = () => true, timeoutMs = 5000) {
      return waitFor<T>(
        () => {
          const idx = texts.findIndex(predicate);
          if (idx === -1) return undefined;
          return texts.splice(idx, 1)[0] as T;
        },
        timeoutMs,
        'ws text message',
      );
    },
    nextBinary(timeoutMs = 5000) {
      return waitFor<Buffer>(() => binaries.shift(), timeoutMs, 'ws binary frame');
    },
    send(msg: unknown) {
      socket.send(JSON.stringify(msg));
    },
    close() {
      return new Promise<void>((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve();
        socket.once('close', () => resolve());
        socket.close();
      });
    },
  };
}
