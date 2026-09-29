import type { FastifyPluginAsync } from 'fastify';
import { API, sensorReadingSchema, type SensorReading } from '@robodog/shared';
import { parseOneOrMany, queryLimit, queryString, type Query } from './validate.js';

export const sensorRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>(API.SENSORS, async (request) => {
    const q = request.query;
    const missionId = queryString(q, 'missionId');
    const readings = app.repos.sensors.list({
      limit: queryLimit(q, 100),
      ...(missionId ? { missionId } : {}),
      ...(queryString(q, 'since') ? { since: queryString(q, 'since') } : {}),
    });
    const latest: SensorReading | null = app.repos.sensors.latest(missionId);
    return { latest, readings };
  });

  app.post(API.SENSORS, async (request, reply) => {
    const readings = parseOneOrMany(sensorReadingSchema, request.body);
    const accepted: string[] = [];
    const duplicates: string[] = [];
    for (const reading of readings) {
      (app.ingest.sensor(reading) === 'accepted' ? accepted : duplicates).push(reading.id);
    }
    return reply.code(accepted.length > 0 ? 201 : 200).send({ accepted, duplicates });
  });
};
