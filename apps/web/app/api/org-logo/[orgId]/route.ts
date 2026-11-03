import { NotFoundError, orgLogoKey } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { privateStorage } from '@/lib/storage.js';

/** Business logo redirect (D-X47): documents link here instead of embedding
 * expiring signed URLs. Logos are public branding, so no session is needed. */
export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  try {
    const url = await privateStorage().getSignedUrl(await orgLogoKey(orgId), 300);
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse('Not found', { status: 404 });
    throw error;
  }
}
