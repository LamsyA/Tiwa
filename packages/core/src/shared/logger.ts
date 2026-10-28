import pino from 'pino';

// Single logging standard for web (server) and worker. JSON everywhere so
// Vercel/Fly can parse it. Convention (enforced by review, not code): never
// log names, phones, emails, addresses or full payloads — log ids.
// Sentry scrubbing (./sentry.ts) is the backstop, not the plan.
export function createLogger(service: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? (process.env.APP_ENV === 'production' ? 'info' : 'debug'),
    base: { service },
    redact: {
      paths: [
        '*.password',
        '*.secret',
        '*.token',
        '*.authorization',
        'req.headers.authorization',
        'req.headers.cookie',
      ],
      remove: true,
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
