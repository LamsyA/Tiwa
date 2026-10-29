import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// UF-02-2: signed-out visitors to app pages go to /login?next=<path>. This is
// a cheap cookie-presence check only; pages and actions still validate the
// session on the server (getCtx), so a forged cookie gets nothing.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/home/:path*', '/settings/:path*', '/onboarding/:path*', '/events/:path*'],
};
