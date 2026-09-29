import type { FastifyPluginAsync } from 'fastify';
import { API, thermalMapUploadSchema } from '@robodog/shared';
import { NotFoundError } from '../errors.js';
import { parseWith, queryLimit, queryString, type Query } from './validate.js';

export const mapRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>(API.MAPS, async (request) => {
    const q = request.query;
    const missionId = queryString(q, 'missionId');
    return app.repos.maps.list({ limit: queryLimit(q, 100), ...(missionId ? { missionId } : {}) });
  });

  /** Full map: metadata from SQLite plus points and trajectory from media/maps/<id>.json. */
  app.get<{ Params: { id: string } }>(`${API.MAPS}/:id`, async (request) => {
    const map = app.repos.maps.get(request.params.id);
    if (!map) throw new NotFoundError('map');
    const file = await app.ingest.readMapFile(map.id);
    return { ...map, points: file?.points ?? [], trajectory: file?.trajectory ?? [] };
  });

  app.post(API.MAPS, async (request, reply) => {
    const upload = parseWith(thermalMapUploadSchema, request.body);
    const { result, map } = await app.ingest.map(upload);
    return reply.code(result === 'accepted' ? 201 : 200).send({ result, item: map });
  });

  app.delete<{ Params: { id: string } }>(`${API.MAPS}/:id`, async (request) => {
    const deleted = await app.ingest.deleteMap(request.params.id);
    if (!deleted) throw new NotFoundError('map');
    return { deleted: true, id: request.params.id };
  });
};
