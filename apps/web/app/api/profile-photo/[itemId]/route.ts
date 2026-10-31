import { getPublicPhotoKey, NotFoundError } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { privateStorage } from '@/lib/storage.js';

/** Portfolio photo redirect (P6-T04): the public pages are ISR-cached, so
 * they link here instead of embedding expiring signed URLs. Only photos of
 * published profiles resolve; nothing else leaks. */
export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  try {
    const key = await getPublicPhotoKey(itemId);
    const url = await privateStorage().getSignedUrl(key, 300);
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse('Not found', { status: 404 });
    throw error;
  }
}
