import type { FastifyRequest } from 'fastify';
import { BadRequestError } from '../errors.js';
import type { MediaStore } from './store.js';

export interface MultipartUpload {
  /** Text fields, e.g. `metadata` (JSON string). */
  fields: Record<string, string>;
  /** The single `file` part, already streamed to a temp file, or null when absent. */
  file: { tmpPath: string; fileName: string; mimeType: string; sizeBytes: number } | null;
}

/**
 * Consume a multipart request: text fields are collected, the `file` part is streamed to a temp
 * file in the media store (never into memory) regardless of field order. Callers must commit or
 * discard the temp file.
 */
export async function readMultipart(request: FastifyRequest, store: MediaStore): Promise<MultipartUpload> {
  const result: MultipartUpload = { fields: {}, file: null };
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file' || result.file) {
        // Drain unexpected files so the stream completes.
        await part.toBuffer();
        continue;
      }
      const { tmpPath, sizeBytes } = await store.writeTemp(part.file);
      if (part.file.truncated) {
        await store.discardTemp(tmpPath);
        throw new BadRequestError('file exceeds the upload size limit');
      }
      result.file = { tmpPath, fileName: part.filename, mimeType: part.mimetype, sizeBytes };
    } else {
      const value = part.value;
      result.fields[part.fieldname] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return result;
}

/** Parse the `metadata` field of a multipart upload as JSON. */
export function parseMetadataField(fields: Record<string, string>): unknown {
  const raw = fields.metadata;
  if (raw === undefined) throw new BadRequestError('multipart upload requires a `metadata` field');
  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('`metadata` field is not valid JSON');
  }
}
