import path from 'node:path';
import { DEV_API_TOKEN } from '@robodog/shared';

/** Fully resolved server configuration. Built from environment variables by {@link loadConfig}. */
export interface Config {
  port: number;
  host: string;
  apiToken: string;
  /** True when ROBODOG_API_TOKEN was not set and the shared development default is in use. */
  usingDefaultToken: boolean;
  /** Absolute path to the SQLite file, or ':memory:' for tests. */
  dbPath: string;
  /** Absolute path of the media root. */
  mediaDir: string;
  simulation: boolean;
  corsOrigin: string;
  logLevel: string;
}

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return TRUTHY.has(value.trim().toLowerCase());
}

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`ROBODOG_PORT must be an integer between 0 and 65535, got "${value}"`);
  }
  return n;
}

function resolvePath(value: string, cwd: string): string {
  if (value === ':memory:') return value;
  return path.isAbsolute(value) ? value : path.resolve(cwd, value);
}

/**
 * Read configuration from `env` (defaults to process.env) with safe development defaults.
 * Relative paths are resolved against `cwd`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): Config {
  const tokenFromEnv = env.ROBODOG_API_TOKEN?.trim();
  const usingDefaultToken = !tokenFromEnv;
  return {
    port: parsePort(env.ROBODOG_PORT, 8080),
    host: env.ROBODOG_HOST?.trim() || '0.0.0.0',
    apiToken: tokenFromEnv || DEV_API_TOKEN,
    usingDefaultToken,
    dbPath: resolvePath(env.ROBODOG_DB_PATH?.trim() || './data/robodog.db', cwd),
    mediaDir: resolvePath(env.ROBODOG_MEDIA_DIR?.trim() || './media', cwd),
    simulation: parseBool(env.ROBODOG_SIMULATION, false),
    corsOrigin: env.ROBODOG_CORS_ORIGIN?.trim() || '*',
    logLevel: env.ROBODOG_LOG_LEVEL?.trim() || 'info',
  };
}
