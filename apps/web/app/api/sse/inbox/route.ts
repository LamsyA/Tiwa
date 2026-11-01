import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { orgChannel, subscribeChat, userChannel } from '@/lib/chat-live.js';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;
const SUBSCRIBE_TIMEOUT_MS = 3_000;

/**
 * One SSE stream per signed-in user with every chat event for them and their
 * businesses (Backend.md §9a.2). Clients refetch bodies through normal reads.
 */
export async function GET(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const userId = ctx.actor.userId;
  const orgs = await prisma.membership.findMany({ where: { userId }, select: { orgId: true } });
  const channels = [userChannel(userId), ...orgs.map((row) => orgChannel(row.orgId))];

  const encoder = new TextEncoder();
  let close: () => Promise<void> = async () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          void close();
        }
      };
      const subscribed = subscribeChat(channels, (event) => {
        // Don't echo my own typing back to me.
        if (event.type === 'typing' && event.userId === userId) return;
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      // Redis down or asleep: don't hang. Close, so the client falls back to polling (D-X20).
      const unsubscribe = await Promise.race([
        subscribed,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SUBSCRIBE_TIMEOUT_MS)),
      ]);
      if (!unsubscribe) {
        void subscribed.then((late) => late()).catch(() => undefined);
        closed = true;
        controller.close();
        return;
      }
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        await unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener('abort', () => void close());
      send('retry: 3000\n\n');
      send('event: ready\ndata: {}\n\n');
    },
    async cancel() {
      await close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
