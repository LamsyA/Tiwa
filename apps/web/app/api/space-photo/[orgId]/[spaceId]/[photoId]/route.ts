import { getPublicSpacePhotoKey, NotFoundError } from '@tiwa/core';
import { NextResponse } from 'next/server';
import { privateStorage } from '@/lib/storage.js';

/** Space photo redirect (P6-T08): same pattern as portfolio photos — only
 * published venues resolve, nothing else leaks. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; spaceId: string; photoId: string }> },
) {
  const { orgId, spaceId, photoId } = await params;
  try {
    const key = await getPublicSpacePhotoKey(orgId, spaceId, photoId);
    const url = await privateStorage().getSignedUrl(key, 300);
    return NextResponse.redirect(url);
  } catch (error) {
    if (error instanceof NotFoundError) return new NextResponse('Not found', { status: 404 });
    throw error;
  }
}
