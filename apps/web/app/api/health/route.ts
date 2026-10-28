import { prisma } from '@tiwa/db';
import { NextResponse } from 'next/server';
import { Redis } from 'ioredis';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function GET() {
  let redis: Redis | undefined;
  try {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: TIMEOUT_MS,
    });
    const [db, cache] = await Promise.allSettled([
      withTimeout(prisma.$queryRaw`SELECT 1`, 'db'),
      (async () => {
        await redis?.connect();
        return withTimeout(redis?.ping() ?? Promise.resolve(''), 'redis');
      })(),
    ]);
    const ok = db.status === 'fulfilled' && cache.status === 'fulfilled';
    return NextResponse.json(
      {
        ok,
        checks: {
          db: db.status === 'fulfilled' ? 'up' : 'down',
          redis: cache.status === 'fulfilled' ? 'up' : 'down',
        },
      },
      { status: ok ? 200 : 503 },
    );
  } finally {
    await redis?.quit().catch(() => undefined);
  }
}
