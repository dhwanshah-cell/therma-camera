import type { FastifyPluginAsync } from 'fastify';
import { API, imuSampleSchema, robotStatusSchema, type RobotStatus } from '@robodog/shared';
import { z } from 'zod';
import { parseWith, queryLimit, type Query } from './validate.js';

/**
 * GET /api/robot when nothing has ever been reported: every unavailable field is null rather than a
 * fabricated "false"/0. `reported` tells the dashboard whether the data came from a real report.
 */
export type UnknownRobotStatus = {
  [K in keyof RobotStatus]: K extends 'timestamp' | 'source' | 'phoneConnected' | 'extra' ? RobotStatus[K] : null;
};

export type RobotStatusResponse = (RobotStatus & { reported: true; lastPhoneSeen: string | null }) | (UnknownRobotStatus & { reported: false; lastPhoneSeen: string | null });

const imuBodySchema = z.object({ samples: z.array(imuSampleSchema).max(5000) });

export const robotRoutes: FastifyPluginAsync = async (app) => {
  app.get(API.ROBOT, async (): Promise<RobotStatusResponse> => {
    const latest = app.repos.robot.latest();
    const phoneConnected = app.hub.phoneConnected;
    if (latest) {
      // Presence is known from the WebSocket, which is more current than the phone's own claim.
      return { ...latest, phoneConnected, reported: true, lastPhoneSeen: app.hub.lastPhoneSeen };
    }
    return {
      timestamp: new Date().toISOString(),
      source: 'REAL',
      phoneConnected,
      esp32Connected: null,
      thermalCameraConnected: null,
      robotConnected: null,
      batteryPct: null,
      motorState: null,
      legState: null,
      imuAvailable: null,
      moving: null,
      slamStatus: null,
      gps: null,
      lidarAvailable: null,
      activeMissionId: null,
      extra: {},
      reported: false,
      lastPhoneSeen: app.hub.lastPhoneSeen,
    };
  });

  app.post(API.ROBOT, async (request, reply) => {
    const status = parseWith(robotStatusSchema, request.body);
    app.ingest.robot(status);
    return reply.code(201).send({ accepted: true, status });
  });

  app.get<{ Querystring: Query }>(`${API.ROBOT}/events`, async (request) => {
    return app.repos.robot.events(queryLimit(request.query, 100, 1000));
  });

  app.get<{ Querystring: Query }>(`${API.ROBOT}/history`, async (request) => {
    return app.repos.robot.history(queryLimit(request.query, 100, 1000));
  });

  app.post(API.IMU, async (request, reply) => {
    const body = parseWith(imuBodySchema, request.body);
    const count = app.ingest.imu(body.samples);
    return reply.code(201).send({ count });
  });
};
