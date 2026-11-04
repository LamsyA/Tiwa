import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/home', '/settings', '/onboarding', '/events', '/inbox'];

// Production serves one address (APP_URL). Sign-in cookies, including the
// OAuth state cookie, belong to the host that set them, so starting Google
// sign-in on a deployment URL or alias ended in ?error=state_mismatch.
function canonicalHost(): string | null {
  if (process.env.APP_ENV !== 'production' || !process.env.APP_URL) return null;
  try {
    return new URL(process.env.APP_URL).host;
  } catch {
    return null;
  }
}

// UF-02-2: signed-out visitors to app pages go to /login?next=<path>. This is
// a cheap cookie-presence check only; pages and actions still validate the
// session on the server (getCtx), so a forged cookie gets nothing.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = canonicalHost();
  const requestHost = request.headers.get('host');
  if (host && requestHost && requestHost !== host) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, `https://${host}`), 308);
  }
  const isProtected = PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!isProtected || getSessionCookie(request)) return NextResponse.next();
  const login = new URL('/login', request.url);
  login.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets, so stray hosts redirect on any page.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-|icons/|.*\\.(?:png|jpg|jpeg|webp|svg|ico|txt|xml|webmanifest)$).*)',
  ],
};
