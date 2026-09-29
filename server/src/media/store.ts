import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { API, STORAGE_LAYOUT } from '@robodog/shared';

/** Media categories map 1:1 to the shared STORAGE_LAYOUT directories. */
export type MediaCategory = keyof typeof STORAGE_LAYOUT;

export interface StoredFile {
  /** Sanitised file name actually used on disk. */
  fileName: string;
  /** Server-relative path, e.g. /media/RoboDog/Thermal/Images/thermal_1.jpg */
  filePath: string;
  absolutePath: string;
  sizeBytes: number;
}

/** Directory (relative to the media root) holding thermal map point clouds. */
export const MAPS_DIR = 'maps';
const TMP_DIR = 'tmp';

/**
 * Keep only a safe basename: strips directories, path separators, control characters and
 * anything outside [A-Za-z0-9._-]. Guarantees the result cannot escape the target directory.
 */
export function sanitizeFileName(name: string, fallback = 'file'): string {
  const base = path.posix.basename(name.replace(/\\/g, '/')).replace(/[^A-Za-z0-9._-]/g, '_');
  const trimmed = base.replace(/^\.+/, '').slice(0, 200);
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Filesystem layout under the media root, mirroring the phone's storage layout:
 *   <root>/RoboDog/Thermal/Images, .../Thermal/Videos, .../RGB/Images, .../RGB/Videos
 *   <root>/maps/<id>.json   thermal map points + trajectory
 *   <root>/tmp              in-flight multipart uploads
 */
export class MediaStore {
  constructor(public readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
    for (const dir of Object.values(STORAGE_LAYOUT)) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.mkdirSync(path.join(root, MAPS_DIR), { recursive: true });
    fs.mkdirSync(path.join(root, TMP_DIR), { recursive: true });
  }

  directory(category: MediaCategory): string {
    return path.join(this.root, STORAGE_LAYOUT[category]);
  }

  /** Server-relative media path for a file in a category. */
  relativePath(category: MediaCategory, fileName: string): string {
    return `${API.MEDIA}/${STORAGE_LAYOUT[category]}/${fileName}`;
  }

  /**
   * Resolve a server-relative `/media/...` path to an absolute path inside the root.
   * Returns null for anything that is not a media path or escapes the root.
   */
  resolve(relativePath: string | null): string | null {
    if (!relativePath || !relativePath.startsWith(`${API.MEDIA}/`)) return null;
    const rel = relativePath.slice(API.MEDIA.length + 1);
    const abs = path.resolve(this.root, rel);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (!abs.startsWith(rootWithSep)) return null;
    return abs;
  }

  tempPath(): string {
    return path.join(this.root, TMP_DIR, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  }

  /** Stream an upload into a temporary file. Returns the temp path and byte count. */
  async writeTemp(stream: Readable): Promise<{ tmpPath: string; sizeBytes: number }> {
    const tmpPath = this.tempPath();
    let sizeBytes = 0;
    stream.on('data', (chunk: Buffer | string) => {
      sizeBytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
    });
    await pipeline(stream, fs.createWriteStream(tmpPath));
    return { tmpPath, sizeBytes };
  }

  /** Move a temp upload to its final location, overwriting any existing file with the same name. */
  async commit(tmpPath: string, category: MediaCategory, requestedName: string): Promise<StoredFile> {
    const fileName = sanitizeFileName(requestedName);
    const absolutePath = path.join(this.directory(category), fileName);
    await fsp.rename(tmpPath, absolutePath);
    const stat = await fsp.stat(absolutePath);
    return { fileName, filePath: this.relativePath(category, fileName), absolutePath, sizeBytes: stat.size };
  }

  async discardTemp(tmpPath: string | null | undefined): Promise<void> {
    if (!tmpPath) return;
    await fsp.rm(tmpPath, { force: true });
  }

  /** Delete the file behind a server-relative media path. Silently ignores missing or phone-local paths. */
  async remove(relativePath: string | null): Promise<boolean> {
    const abs = this.resolve(relativePath);
    if (!abs) return false;
    try {
      await fsp.rm(abs, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  exists(relativePath: string | null): boolean {
    const abs = this.resolve(relativePath);
    return abs !== null && fs.existsSync(abs);
  }

  // ---- thermal map point files -------------------------------------------------------------

  mapFileName(id: string): string {
    return `${sanitizeFileName(id, 'map')}.json`;
  }

  mapRelativePath(id: string): string {
    return `${API.MEDIA}/${MAPS_DIR}/${this.mapFileName(id)}`;
  }

  async writeMap(id: string, data: unknown): Promise<string> {
    const abs = path.join(this.root, MAPS_DIR, this.mapFileName(id));
    await fsp.writeFile(abs, JSON.stringify(data));
    return this.mapRelativePath(id);
  }

  async readMap<T>(id: string): Promise<T | null> {
    const abs = path.join(this.root, MAPS_DIR, this.mapFileName(id));
    try {
      return JSON.parse(await fsp.readFile(abs, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  async removeMap(id: string): Promise<void> {
    await fsp.rm(path.join(this.root, MAPS_DIR, this.mapFileName(id)), { force: true });
  }
}
