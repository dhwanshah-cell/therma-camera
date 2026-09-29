import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { API } from '@robodog/shared';
import { authPlugin } from './auth.js';
import type { Config } from './config.js';
import { openDatabase, type Db } from './db/database.js';
import { createRepositories, type Repositories } from './db/repositories/index.js';
import { BadRequestError, NotFoundError, ValidationError } from './errors.js';
import { MediaStore } from './media/store.js';
import { alertRoutes } from './routes/alerts.js';
import { healthRoutes } from './routes/health.js';
import { mapRoutes } from './routes/maps.js';
import { mediaRoutes } from './routes/media.js';
import { missionRoutes } from './routes/missions.js';
import { robotRoutes } from './routes/robot.js';
import { sensorRoutes } from './routes/sensors.js';
import { statsRoutes } from './routes/stats.js';
import { storageRoutes } from './routes/storage.js';
import { syncRoutes } from './routes/sync.js';
import { Ingest } from './services/ingest.js';
import { Simulator, type SimulatorOptions } from './simulation/simulator.js';
import { Hub, type HubOptions } from './ws/hub.js';
import { wsRoutes } from './ws/routes.js';

/** Multipart uploads (thermal/RGB images and videos) are capped at 50 MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    serverVersion: string;
    db: Db;
    repos: Repositories;
    mediaStore: MediaStore;
    hub: Hub;
    ingest: Ingest;
    simulator: Simulator | null;
  }
}

export interface BuildOptions {
  /** Override hub timings (tests). */
  hub?: Partial<HubOptions>;
  /** Override simulator cadence (tests). */
  simulator?: SimulatorOptions;
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Build a fully wired Fastify app without listening. Tests call this with an in-memory database
 * and a temporary media directory; main.ts calls it with the environment configuration.
 */
export async function buildApp(config: Config, options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: MAX_UPLOAD_BYTES,
    trustProxy: true,
  });

  if (config.usingDefaultToken) {
    app.log.warn(`ROBODOG_API_TOKEN is not set: using the shared development token. Set a real token before deploying.`);
  }

  const db = openDatabase(config.dbPath);
  const repos = createRepositories(db);
  const mediaStore = new MediaStore(config.mediaDir);
  const hub = new Hub(repos, app.log, { simulation: config.simulation, ...options.hub });
  const ingest = new Ingest(repos, mediaStore, hub, app.log);
  hub.attachIngest(ingest);
  const simulator = config.simulation ? new Simulator(repos, ingest, hub, app.log, options.simulator) : null;

  app.decorate('config', config);
  app.decorate('serverVersion', readVersion());
  app.decorate('db', db);
  app.decorate('repos', repos);
  app.decorate('mediaStore', mediaStore);
  app.decorate('hub', hub);
  app.decorate('ingest', ingest);
  app.decorate('simulator', simulator);

  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((s) => s.trim()) });
  await app.register(authPlugin, { token: config.apiToken });
  await app.register(websocket, { options: { maxPayload: MAX_UPLOAD_BYTES } });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 20 } });

  fs.mkdirSync(config.mediaDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: path.resolve(config.mediaDir),
    prefix: `${API.MEDIA}/`,
    decorateReply: false,
    index: false,
    list: false,
    dotfiles: 'deny',
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(400).send({ error: 'validation_failed', issues: error.zodError.issues });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'validation_failed', issues: error.issues });
    }
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: error.message });
    if (error instanceof BadRequestError) return reply.code(400).send({ error: 'bad_request', message: error.message });
    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyError.code === 'FST_REQ_FILE_TOO_LARGE' || fastifyError.statusCode === 413) {
      return reply.code(413).send({ error: 'payload_too_large', message: `uploads are limited to ${MAX_UPLOAD_BYTES} bytes` });
    }
    if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      return reply.code(fastifyError.statusCode).send({ error: fastifyError.code ?? 'bad_request', message: fastifyError.message });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' }));

  await app.register(healthRoutes);
  await app.register(sensorRoutes);
  await app.register(alertRoutes);
  await app.register(missionRoutes);
  await app.register(mediaRoutes);
  await app.register(mapRoutes);
  await app.register(robotRoutes);
  await app.register(syncRoutes);
  await app.register(storageRoutes);
  await app.register(statsRoutes);
  await app.register(wsRoutes);

  app.addHook('onReady', async () => {
    hub.start();
    simulator?.start();
  });

  // preClose runs before the websocket plugin closes its server, so clients get a clean 1001 first.
  app.addHook('preClose', async () => {
    simulator?.stop();
    hub.stop();
  });

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
