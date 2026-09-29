import { buildApp } from './app.js';
import { loadConfig } from './config.js';

/** Entry point: `npm run dev -w server` (tsx) or `node dist/main.js`. */
async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      app.log.error('forced exit after shutdown timeout');
      process.exit(1);
    }, 10_000);
    timer.unref();
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'error during shutdown');
        process.exit(1);
      });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled rejection');
  });

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      { simulation: config.simulation, dbPath: config.dbPath, mediaDir: config.mediaDir },
      `RoboDog server listening on http://${config.host}:${config.port} (ws: /ws)`,
    );
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }
}

void main();
