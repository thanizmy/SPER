import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './src/app';

/**
 * Vercel entry point. Fastify normally owns its own http.Server via
 * app.listen(); here Vercel owns the server instead, so we build the app
 * once per function instance (reused across warm invocations) and hand
 * each incoming request to Fastify's internal request handling.
 */
let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp().then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit('request', req, res);
}
