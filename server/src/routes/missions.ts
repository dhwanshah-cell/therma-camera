import type { FastifyPluginAsync } from 'fastify';
import { API, createMissionSchema, dataSourceSchema, updateMissionSchema, type Mission } from '@robodog/shared';
import { NotFoundError } from '../errors.js';
import { parseWith, queryLimit, queryString, type Query } from './validate.js';

export const missionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>(API.MISSIONS, async (request) => {
    const q = request.query;
    const status = queryString(q, 'status');
    const source = queryString(q, 'source');
    return app.repos.missions.list({
      limit: queryLimit(q, 500),
      ...(status ? { status: parseWith(updateMissionSchema.shape.status.unwrap(), status) } : {}),
      ...(source ? { source: parseWith(dataSourceSchema, source) } : {}),
    });
  });

  app.post(API.MISSIONS, async (request, reply) => {
    const body = parseWith(createMissionSchema, request.body);
    const { result, mission } = app.ingest.createMission(body);
    return reply.code(result === 'accepted' ? 201 : 200).send(mission);
  });

  app.get<{ Params: { id: string } }>(`${API.MISSIONS}/:id`, async (request): Promise<Mission> => {
    const mission = app.repos.missions.get(request.params.id);
    if (!mission) throw new NotFoundError('mission');
    return mission;
  });

  app.patch<{ Params: { id: string } }>(`${API.MISSIONS}/:id`, async (request) => {
    const patch = parseWith(updateMissionSchema, request.body);
    if (!app.repos.missions.exists(request.params.id)) throw new NotFoundError('mission');
    const mission = app.ingest.updateMission(request.params.id, patch);
    if (!mission) throw new NotFoundError('mission');
    return mission;
  });

  app.get<{ Params: { id: string } }>(`${API.MISSIONS}/:id/summary`, async (request) => {
    const id = request.params.id;
    const mission = app.repos.missions.get(id);
    if (!mission) throw new NotFoundError('mission');
    return {
      mission,
      alerts: app.repos.alerts.list({ missionId: id, limit: 1000 }),
      thermalImages: app.repos.thermalImages.list({ missionId: id, limit: 1000 }),
      rgbImages: app.repos.rgbImages.list({ missionId: id, limit: 1000 }),
      videos: app.repos.videos.list({ missionId: id, limit: 1000 }),
      maps: app.repos.maps.list({ missionId: id, limit: 1000 }),
      sensorCount: mission.stats.sensorReadings,
    };
  });
};
