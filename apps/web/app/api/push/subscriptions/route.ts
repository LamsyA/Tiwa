import {
  pushSubscriptionSchema,
  registerPushSubscription,
  unregisterPushSchema,
  unregisterPushSubscription,
} from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Push subscription register/unregister (P13-T03). */
export async function POST(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const input = pushSubscriptionSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  await registerPushSubscription(ctx.actor, input.data);
  return NextResponse.json({ ok: true, data: {} });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const input = unregisterPushSchema.safeParse(body);
  if (!input.success) return NextResponse.json({ ok: false, error: { code: 'VALIDATION' } }, { status: 400 });
  await unregisterPushSubscription(ctx.actor, input.data);
  return NextResponse.json({ ok: true, data: {} });
}
