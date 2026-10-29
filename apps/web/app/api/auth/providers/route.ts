import { NextResponse } from 'next/server';

/** Which social providers are configured (drives the Google button). */
export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
}
