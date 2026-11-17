'use server';

import { env } from '@tiwa/config';
import { decideChangeByToken, verifyChangeToken } from '@tiwa/core';
import { headers } from 'next/headers';

/**
 * D-X84: the vendor approves or declines from the WhatsApp link, signed out.
 * The signed token is the permission; it only ever decides this one change.
 */
export async function decideChange(token: string, accept: boolean): Promise<{ ok: boolean; error?: string }> {
  const secret = env.AUTH_SECRET;
  const versionId = secret ? verifyChangeToken(token, secret) : null;
  if (!versionId) return { ok: false, error: 'invalid' };
  try {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
    await decideChangeByToken(versionId, accept, ip ? { ip } : undefined);
    return { ok: true };
  } catch (error) {
    const key = (error as { details?: { key?: string } }).details?.key;
    return { ok: false, error: key === 'alreadyDecided' ? 'alreadyDecided' : 'failed' };
  }
}
