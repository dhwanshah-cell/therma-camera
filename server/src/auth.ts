import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { API, AUTH_HEADER } from '@robodog/shared';

export interface AuthOptions {
  token: string;
}

/** Extract the presented token from the header, an Authorization bearer or the `token` query parameter. */
export function extractToken(request: FastifyRequest): string | null {
  const header = request.headers[AUTH_HEADER];
  if (typeof header === 'string' && header.length > 0) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const query = request.query as Record<string, unknown> | undefined;
  const q = query?.token;
  if (typeof q === 'string' && q.length > 0) return q;
  return null;
}

function isUpgradeRequest(request: FastifyRequest): boolean {
  const upgrade = request.raw.headers.upgrade;
  return typeof upgrade === 'string' && upgrade.toLowerCase() === 'websocket';
}

function requiresAuth(url: string): boolean {
  const pathOnly = url.split('?')[0] ?? url;
  if (pathOnly === API.HEALTH) return false;
  return pathOnly.startsWith('/api/') || pathOnly.startsWith(`${API.MEDIA}/`) || pathOnly === API.WS;
}

/**
 * Token authentication for every /api route (except GET /api/health), the /media files and /ws.
 * WebSocket upgrades run through the same onRequest hook, so `?token=` works for them and for <img src>.
 */
export const authPlugin = fp<AuthOptions>(async (app: FastifyInstance, opts: AuthOptions) => {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!requiresAuth(request.url)) return;
    const presented = extractToken(request);
    if (presented !== opts.token) {
      if (isUpgradeRequest(request)) {
        // A rejected WebSocket upgrade is answered on a socket Node no longer tracks: close it
        // ourselves once the 401 has been flushed so it cannot linger and block shutdown.
        reply.header('connection', 'close');
        const raw = request.raw;
        reply.raw.once('finish', () => raw.socket?.destroy());
      }
      reply.code(401).send({ error: 'unauthorized' });
      return reply;
    }
  });
});
