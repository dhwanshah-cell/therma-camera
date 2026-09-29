import type { FastifyPluginAsync } from 'fastify';
import { API, alertSchema, alertSeveritySchema, alertTypeSchema } from '@robodog/shared';
import { NotFoundError } from '../errors.js';
import { parseOneOrMany, parseWith, queryBool, queryLimit, queryString, type Query } from './validate.js';

export const alertRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>(API.ALERTS, async (request) => {
    const q = request.query;
    const type = queryString(q, 'type');
    const severity = queryString(q, 'severity');
    const missionId = queryString(q, 'missionId');
    const acknowledged = queryBool(q, 'acknowledged');
    return app.repos.alerts.list({
      limit: queryLimit(q, 100),
      ...(missionId ? { missionId } : {}),
      ...(type ? { type: parseWith(alertTypeSchema, type) } : {}),
      ...(severity ? { severity: parseWith(alertSeveritySchema, severity) } : {}),
      ...(acknowledged !== undefined ? { acknowledged } : {}),
    });
  });

  app.post(API.ALERTS, async (request, reply) => {
    const alerts = parseOneOrMany(alertSchema, request.body);
    const accepted: string[] = [];
    const duplicates: string[] = [];
    for (const alert of alerts) {
      (app.ingest.alert(alert) === 'accepted' ? accepted : duplicates).push(alert.id);
    }
    return reply.code(accepted.length > 0 ? 201 : 200).send({ accepted, duplicates });
  });

  app.post<{ Params: { id: string } }>(`${API.ALERTS}/:id/acknowledge`, async (request) => {
    const alert = app.repos.alerts.acknowledge(request.params.id);
    if (!alert) throw new NotFoundError('alert');
    app.hub.broadcastToWeb({ type: 'alert', alert });
    return alert;
  });
};
