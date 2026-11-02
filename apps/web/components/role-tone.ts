import type { AppRole } from '@tiwa/ui';

/** Role colours, shared by server and client components (a 'use client' module can't export plain values to the server). */
export const ROLE_TONE: Record<AppRole, string> = {
  host: 'var(--brand)',
  planner: 'var(--accent)',
  vendor: 'var(--warning)',
};
