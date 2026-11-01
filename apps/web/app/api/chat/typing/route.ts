import { isDomainError, requireParticipant } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { publishTyping } from '@/lib/chat-live.js';
import { getCtx } from '@/lib/ctx.js';

const body = z.object({ threadId: z.string().uuid() });

/** Ephemeral typing signal (§9a.2): participants only, nothing stored. */
export async function POST(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const input = body.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  try {
    await requireParticipant(ctx.actor, input.data.threadId);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.status });
  }
  const user = await prisma.user.findUnique({ where: { id: ctx.actor.userId }, select: { name: true, phone: true } });
  const name = user?.name && user.name !== user.phone ? (user.name.split(/\s+/)[0] ?? null) : null;
  await publishTyping(input.data.threadId, ctx.actor.userId, name);
  return NextResponse.json({ ok: true });
}
