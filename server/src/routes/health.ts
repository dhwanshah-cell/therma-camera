import type { FastifyPluginAsync } from 'fastify';
import { API, type HealthResponse } from '@robodog/shared';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(API.HEALTH, async (): Promise<HealthResponse> => ({
    status: 'ok',
    version: app.serverVersion,
    simulation: app.config.simulation,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  }));
};
