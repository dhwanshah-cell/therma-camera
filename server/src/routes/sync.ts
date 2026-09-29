import type { FastifyPluginAsync } from 'fastify';
import { API, syncBatchRequestSchema, type SyncBatchResponse } from '@robodog/shared';
import { ZodError, type z } from 'zod';
import type { InsertResult } from '../db/repositories/index.js';
import { parseWith } from './validate.js';

type Envelope = z.infer<typeof syncBatchRequestSchema>['items'][number];

function describeError(err: unknown): string {
  if (err instanceof ZodError) return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * POST /api/sync: the phone's offline queue. Each envelope is dispatched by kind to the same ingest
 * path as the individual endpoints. Envelope ids are recorded in sync_log so a resent batch reports
 * duplicates instead of double-inserting; record-level ids are deduplicated as well.
 */
export const syncRoutes: FastifyPluginAsync = async (app) => {
  app.post(API.SYNC, async (request): Promise<SyncBatchResponse> => {
    const batch = parseWith(syncBatchRequestSchema, request.body);
    app.repos.devices.touch(batch.deviceId, 'sync');
    const response: SyncBatchResponse = { accepted: [], duplicates: [], rejected: [] };

    for (const envelope of batch.items) {
      if (app.repos.syncLog.has(envelope.id)) {
        response.duplicates.push(envelope.id);
        continue;
      }
      try {
        const result = await dispatch(envelope);
        app.repos.syncLog.record(envelope.id, envelope.kind, batch.deviceId);
        (result === 'accepted' ? response.accepted : response.duplicates).push(envelope.id);
      } catch (err) {
        app.log.warn({ err, envelopeId: envelope.id, kind: envelope.kind }, 'sync envelope rejected');
        response.rejected.push({ id: envelope.id, reason: describeError(err) });
      }
    }
    return response;
  });

  async function dispatch(envelope: Envelope): Promise<InsertResult> {
    const { ingest } = app;
    switch (envelope.kind) {
      case 'sensor':
        return ingest.sensor(ingest.parseSensor(envelope.payload));
      case 'alert':
        return ingest.alert(ingest.parseAlert(envelope.payload));
      case 'thermal_image':
        return ingest.thermalImage(ingest.parseThermalImage(envelope.payload));
      case 'rgb_image':
        return ingest.rgbImage(ingest.parseRgbImage(envelope.payload));
      case 'video':
        return ingest.video(ingest.parseVideo(envelope.payload));
      case 'map':
        return (await ingest.map(ingest.parseMap(envelope.payload))).result;
      case 'mission':
        return ingest.upsertMission(ingest.parseMission(envelope.payload)).result;
      case 'robot':
        ingest.robot(ingest.parseRobot(envelope.payload));
        return 'accepted';
      case 'imu_batch':
        ingest.imu(ingest.parseImuBatch(envelope.payload));
        return 'accepted';
    }
  }
};
