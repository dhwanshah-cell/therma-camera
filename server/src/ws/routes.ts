import type { FastifyPluginAsync } from 'fastify';
import { API } from '@robodog/shared';

/** Mounts /ws and hands every accepted socket to the hub. Auth is enforced by the onRequest hook. */
export const wsRoutes: FastifyPluginAsync = async (app) => {
  app.get(API.WS, { websocket: true }, (socket, request) => {
    app.hub.handleConnection(socket, request);
  });
};
