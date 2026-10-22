import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { api } from './channels/web.ts';
import { HOST, PORT, UI_DIR } from './config.ts';
import { emit } from './events/log.ts';

export function startServer() {
  const app = new Hono();
  app.route('/', api);
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), UI_DIR) || './ui' }));
  app.onError((err, c) => { emit('server.error', null, { path: c.req.path, error: err.message }); return c.json({ error: err.message }, 500); });
  return serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => emit('daemon.listening', null, { url: `http://${HOST}:${info.port}` }));
}
