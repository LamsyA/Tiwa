import { createServer, type Server } from 'node:http';
import type { Redis } from 'ioredis';

/**
 * Tiny health page (D-X55). Free hosts (Render) sleep a web service after
 * ~15 minutes without HTTP traffic; an outside cron pings /health every 10
 * minutes to keep the worker — and its Redis connection — awake. Answers 200
 * only while Redis responds, so the host restarts a wedged worker.
 */
export function startHealthServer(connection: Redis, port: number): Server {
  const startedAt = Date.now();
  const server = createServer((request, response) => {
    if (request.url !== '/health' && request.url !== '/') {
      response.writeHead(404).end();
      return;
    }
    connection
      .ping()
      .then(() => {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, uptimeSec: Math.round((Date.now() - startedAt) / 1000) }));
      })
      .catch(() => {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: false }));
      });
  });
  server.listen(port);
  return server;
}
