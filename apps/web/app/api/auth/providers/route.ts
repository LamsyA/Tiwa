import { NextResponse } from 'next/server';
import { authMethods } from '@/lib/auth-methods.js';

/** Which sign-in methods are live (drives the phone and Google options; D-X48). */
export async function GET() {
  return NextResponse.json(authMethods());
}
