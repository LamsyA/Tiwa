import { loadEventAccess } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';
import { eventChannel, subscribeLive } from '@/lib/live.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

/**
 * SSE stream of change notices for one event (`event:{id}` channel, P3-T08).
 * Members only. Access is re-checked on every notice, so a removed member's
 * stream closes on the next change (UF-04-3).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const userId = ctx.actor.userId;
  if (!(await loadEventAccess(userId, id))) {
    return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup = async () => undefined as void;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (text: string) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        await unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed by the client
        }
      };
      const unsubscribe = await subscribeLive(eventChannel(id), (message) => {
        void loadEventAccess(userId, id).then((access) => {
          if (!access) return void close();
          send(`event: change\ndata: ${JSON.stringify(message)}\n\n`);
        });
      });
      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      cleanup = close;
      request.signal.addEventListener('abort', () => void close());
      send('retry: 5000\n\n');
      send('event: ready\ndata: {}\n\n');
    },
    async cancel() {
      await cleanup();
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
