import type { FastifyPluginAsync } from 'fastify';
import { MEDIA_TYPES, type MediaType, type RgbImage, type ThermalImage, type ThermalMap, type VideoRecording } from '@robodog/shared';
import { z } from 'zod';
import { parseWith, queryLimit, queryString, type Query } from './validate.js';

export type StorageItem =
  | { mediaType: 'THERMAL_IMAGE'; item: ThermalImage }
  | { mediaType: 'RGB_IMAGE'; item: RgbImage }
  | { mediaType: 'THERMAL_VIDEO'; item: VideoRecording }
  | { mediaType: 'RGB_VIDEO'; item: VideoRecording }
  | { mediaType: 'THERMAL_MAP'; item: ThermalMap };

const mediaTypeSchema = z.enum(MEDIA_TYPES);

/** GET /api/storage: unified, newest-first list of every media kind for the STORAGE page. */
export const storageRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: Query }>('/api/storage', async (request) => {
    const q = request.query;
    const typeParam = queryString(q, 'type');
    const types: MediaType[] = typeParam ? [parseWith(mediaTypeSchema, typeParam)] : [...MEDIA_TYPES];
    const limit = queryLimit(q, 100, 2000);
    const missionId = queryString(q, 'missionId');
    const from = queryString(q, 'from');
    const to = queryString(q, 'to');
    const query = { limit, ...(missionId ? { missionId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };

    const items: StorageItem[] = [];
    for (const type of types) {
      switch (type) {
        case 'THERMAL_IMAGE':
          for (const item of app.repos.thermalImages.list(query)) items.push({ mediaType: type, item });
          break;
        case 'RGB_IMAGE':
          for (const item of app.repos.rgbImages.list(query)) items.push({ mediaType: type, item });
          break;
        case 'THERMAL_VIDEO':
          for (const item of app.repos.videos.list({ ...query, kind: 'THERMAL' })) items.push({ mediaType: type, item });
          break;
        case 'RGB_VIDEO':
          for (const item of app.repos.videos.list({ ...query, kind: 'RGB' })) items.push({ mediaType: type, item });
          break;
        case 'THERMAL_MAP':
          for (const item of app.repos.maps.list(query)) items.push({ mediaType: type, item });
          break;
      }
    }
    items.sort((a, b) => (a.item.timestamp < b.item.timestamp ? 1 : a.item.timestamp > b.item.timestamp ? -1 : 0));
    return items.slice(0, limit);
  });
};
