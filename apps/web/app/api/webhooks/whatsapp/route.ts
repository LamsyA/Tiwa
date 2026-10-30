import { env } from '@tiwa/config';
import { prisma } from '@tiwa/db';
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from '@tiwa/messaging';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/whatsapp — Meta Cloud API webhook (P4-T10).
 * GET verifies the webhook (hub.mode/challenge). POST verifies the
 * HMAC signature, then: delivery receipts → InviteDelivery statuses and
 * reply-button taps with `rsvp:{yes|no}:{guestId}` → RSVP answers.
 * Unknown payloads are skipped by the parser (Meta adds fields freely).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!env.WHATSAPP_APP_SECRET || !verifyWhatsAppSignature(raw, signature, env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ ok: false, error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  for (const event of parseWhatsAppWebhook(body)) {
    if (event.kind === 'status') {
      const status =
        event.status === 'read'
          ? 'DELIVERED'
          : event.status === 'delivered'
            ? 'DELIVERED'
            : event.status === 'sent'
              ? 'SENT'
              : 'FAILED';
      await prisma.inviteDelivery.updateMany({
        where: { providerRef: event.messageId, channel: 'WHATSAPP_API' },
        data: { status, ...(event.error ? { error: event.error.slice(0, 280) } : {}) },
      });
      continue;
    }
    const match = /^rsvp:(yes|no):([0-9a-f-]{36})$/.exec(event.payload);
    if (!match) continue;
    const [, answer, guestId] = match;
    const guest = await prisma.guest.findUnique({
      where: { id: guestId as string },
      select: { id: true, eventId: true, rsvp: true, inviteToken: true, inviteRevokedAt: true, deletedAt: true },
    });
    if (!guest || guest.inviteRevokedAt || guest.deletedAt) continue;
    const eventRow = await prisma.event.findUnique({ where: { id: guest.eventId }, select: { status: true } });
    if (!eventRow || eventRow.status === 'CANCELLED' || eventRow.status === 'COMPLETED') continue;
    const response = (answer as string).toUpperCase() === 'YES' ? 'YES' : 'NO';
    if (guest.rsvp === response) continue;
    await prisma.$transaction(async (tx) => {
      await tx.guest.update({ where: { id: guest.id }, data: { rsvp: response, respondedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          actorId: null,
          actorType: 'guest',
          action: 'invites.answerRsvp',
          targetType: 'Guest',
          targetId: guest.id,
          data: { via: 'whatsapp-reply' },
        },
      });
    });
  }
  return NextResponse.json({ ok: true });
}
