import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeAny, z } from 'zod';
import { API, rgbImageSchema, thermalImageSchema, videoRecordingSchema, type RgbImage, type ThermalImage, type VideoRecording } from '@robodog/shared';
import type { FileAttachment, InsertResult, MediaQuery } from '../db/repositories/index.js';
import { BadRequestError, NotFoundError } from '../errors.js';
import type { MediaCategory } from '../media/store.js';
import { parseMetadataField, readMultipart } from '../media/upload.js';
import { parseWith, queryLimit, queryString, type Query } from './validate.js';

interface MediaRecord {
  id: string;
  fileName: string;
  filePath: string;
  sizeBytes: number | null;
  uploaded: boolean;
}

interface MediaRepo<T extends MediaRecord> {
  get(id: string): T | null;
  list(q: MediaQuery): T[];
  attachFile(id: string, file: FileAttachment): T | null;
  delete(id: string): boolean;
}

interface MediaRouteSpec<S extends ZodTypeAny, T extends MediaRecord> {
  prefix: string;
  category: MediaCategory;
  schema: S;
  repo: MediaRepo<T>;
  /** Persist + broadcast through the ingest service. */
  ingest: (item: T) => InsertResult;
  /** Extra semantic validation, e.g. the video kind must match the route. */
  check?: (item: z.infer<S>) => void;
  /** Adjust list query (videos filter by kind). */
  listQuery?: (q: MediaQuery) => MediaQuery;
}

function mediaQueryFrom(q: Query): MediaQuery {
  const missionId = queryString(q, 'missionId');
  const from = queryString(q, 'from');
  const to = queryString(q, 'to');
  return {
    limit: queryLimit(q, 100),
    ...(missionId ? { missionId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

/**
 * Registers the shared GET/POST/:id/:id/file/DELETE pattern for an image or video table.
 * POST accepts application/json metadata or multipart (`metadata` JSON string + `file` binary).
 */
function registerMediaRoutes<S extends ZodTypeAny, T extends MediaRecord>(app: FastifyInstance, spec: MediaRouteSpec<S, T>): void {
  const { prefix, category, schema, repo } = spec;

  app.get<{ Querystring: Query }>(prefix, async (request) => {
    const base = mediaQueryFrom(request.query);
    return repo.list(spec.listQuery ? spec.listQuery(base) : base);
  });

  app.get<{ Params: { id: string } }>(`${prefix}/:id`, async (request) => {
    const item = repo.get(request.params.id);
    if (!item) throw new NotFoundError('media item');
    return item;
  });

  app.post(prefix, async (request: FastifyRequest, reply) => {
    if (!request.isMultipart()) {
      const item = parseWith(schema, request.body) as T;
      spec.check?.(item);
      const result = spec.ingest(item);
      return reply.code(result === 'accepted' ? 201 : 200).send({ result, item: repo.get(item.id) ?? item });
    }
    const upload = await readMultipart(request, app.mediaStore);
    try {
      const item = parseWith(schema, parseMetadataField(upload.fields)) as T;
      spec.check?.(item);
      if (!upload.file) throw new BadRequestError('multipart upload requires a `file` part');
      const stored = await app.mediaStore.commit(upload.file.tmpPath, category, item.fileName || upload.file.fileName);
      upload.file = null;
      const withFile: T = { ...item, fileName: stored.fileName, filePath: stored.filePath, sizeBytes: stored.sizeBytes, uploaded: true };
      let result = spec.ingest(withFile);
      let final = repo.get(item.id) ?? withFile;
      if (result === 'duplicate' && !final.uploaded) {
        // Metadata was synced earlier without the binary: attach it now.
        final = repo.attachFile(item.id, stored) ?? final;
        result = 'accepted';
        app.log.info({ id: item.id }, 'attached file to previously synced media metadata');
      }
      return reply.code(result === 'accepted' ? 201 : 200).send({ result, item: final });
    } finally {
      if (upload.file) await app.mediaStore.discardTemp(upload.file.tmpPath);
    }
  });

  app.post<{ Params: { id: string } }>(`${prefix}/:id/file`, async (request, reply) => {
    const existing = repo.get(request.params.id);
    if (!existing) throw new NotFoundError('media item');
    if (!request.isMultipart()) throw new BadRequestError('expected a multipart upload with a `file` part');
    const upload = await readMultipart(request, app.mediaStore);
    try {
      if (!upload.file) throw new BadRequestError('multipart upload requires a `file` part');
      const stored = await app.mediaStore.commit(upload.file.tmpPath, category, existing.fileName || upload.file.fileName);
      upload.file = null;
      const updated = repo.attachFile(existing.id, stored);
      if (!updated) throw new NotFoundError('media item');
      return reply.code(200).send({ result: 'accepted', item: updated });
    } finally {
      if (upload.file) await app.mediaStore.discardTemp(upload.file.tmpPath);
    }
  });

  app.delete<{ Params: { id: string } }>(`${prefix}/:id`, async (request) => {
    const existing = repo.get(request.params.id);
    if (!existing) throw new NotFoundError('media item');
    const fileRemoved = await app.mediaStore.remove(existing.filePath);
    repo.delete(existing.id);
    return { deleted: true, id: existing.id, fileRemoved };
  });
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  registerMediaRoutes<typeof thermalImageSchema, ThermalImage>(app, {
    prefix: API.THERMAL_IMAGES,
    category: 'THERMAL_IMAGES',
    schema: thermalImageSchema,
    repo: app.repos.thermalImages,
    ingest: (item) => app.ingest.thermalImage(item),
  });

  registerMediaRoutes<typeof rgbImageSchema, RgbImage>(app, {
    prefix: API.RGB_IMAGES,
    category: 'RGB_IMAGES',
    schema: rgbImageSchema,
    repo: app.repos.rgbImages,
    ingest: (item) => app.ingest.rgbImage(item),
  });

  registerMediaRoutes<typeof videoRecordingSchema, VideoRecording>(app, {
    prefix: API.THERMAL_VIDEOS,
    category: 'THERMAL_VIDEOS',
    schema: videoRecordingSchema,
    repo: app.repos.videos,
    ingest: (item) => app.ingest.video(item),
    check: (item) => {
      if (item.kind !== 'THERMAL') throw new BadRequestError('video kind must be THERMAL for this endpoint');
    },
    listQuery: (q) => ({ ...q, kind: 'THERMAL' }) as MediaQuery,
  });

  registerMediaRoutes<typeof videoRecordingSchema, VideoRecording>(app, {
    prefix: API.RGB_VIDEOS,
    category: 'RGB_VIDEOS',
    schema: videoRecordingSchema,
    repo: app.repos.videos,
    ingest: (item) => app.ingest.video(item),
    check: (item) => {
      if (item.kind !== 'RGB') throw new BadRequestError('video kind must be RGB for this endpoint');
    },
    listQuery: (q) => ({ ...q, kind: 'RGB' }) as MediaQuery,
  });
}
