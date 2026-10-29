import { auth } from '@/lib/auth.js';
import { toNextJsHandler } from 'better-auth/next-js';

/**
 * Better Auth catch-all: session management, OAuth callback,
 * magic-link verify, phone verify (direct plugin endpoints).
 * Initiation (OTP send, magic-link send) goes through our rate-limited
 * wrappers in ./otp/* and ./magic-link/* instead.
 */
export const { GET, POST } = toNextJsHandler(auth);
