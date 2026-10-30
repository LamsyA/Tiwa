import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { subscribeLive } from '@/lib/live.js';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 25_000;

/**
 * SSE stream of gallery change notices (`gallery:{id}` channel, UF-10-5).
 * Same privacy gate as the page: GUESTS_ONLY needs a member, a guest
 * session cookie for this gallery, or the access code (?access=).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gallery = await prisma.gallery.findUnique({
    where: { id },
    select: { id: true, privacy: true, accessCode: true },
  });
  if (!gallery) return NextResponse.json({ ok: false, error: { code: 'NOT_FOUND' } }, { status: 404 });

  const url = new URL(request.url);
  const accessCode = (url.searchParams.get('access') ?? '').trim().toUpperCase();
  const { viewer, sessionIds } = await galleryViewerFromRequest(request);

  let allowed = gallery.privacy !== 'GUESTS_ONLY';
  if (!allowed && viewer.kind === 'user') {
    const member = await prisma.eventParticipant.findFirst({
      where: { userId: viewer.userId, event: { gallery: { id } }, removedAt: null },
      select: { id: true },
    });
    allowed = member !== null;
  }
  if (!allowed) {
    const candidates = viewer.kind === 'gallery-session' ? [viewer.sessionId, ...sessionIds] : sessionIds;
    for (const candidate of candidates) {
      const session = await prisma.guestSession.findUnique({
        where: { id: candidate },
        select: { galleryId: true, blockedAt: true },
      });
      if (session && session.galleryId === id && !session.blockedAt) {
        allowed = true;
        break;
      }
    }
  }
  if (!allowed && accessCode && gallery.accessCode && accessCode === gallery.accessCode.toUpperCase()) allowed = true;
  if (!allowed) return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });

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
      const unsubscribe = await subscribeLive(`gallery:${id}`, (message) => {
        send(`event: change\ndata: ${JSON.stringify(message)}\n\n`);
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
