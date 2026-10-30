import { deleteOwnMedia } from '@tiwa/core';
import { NextResponse, type NextRequest } from 'next/server';
import { galleryViewerFromRequest } from '@/lib/gallery-viewer.js';
import { coreErrorResponse } from '@/lib/api-error.js';

export const dynamic = 'force-dynamic';

/** POST /api/gallery/media/{id}/delete — guests delete their own uploads (UF-10, MOM-17). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { viewer, sessionIds } = await galleryViewerFromRequest(_request);
  try {
    const result = await deleteOwnMedia(viewer, { mediaId: id, sessionIds });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return coreErrorResponse(error);
  }
}
