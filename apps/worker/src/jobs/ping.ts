export const PING_JOB = 'ping' as const;

export interface PingResult {
  pong: true;
  at: string;
}

/** Pure ping handler — safe to run twice, no side effects. */
export async function handlePing(): Promise<PingResult> {
  return { pong: true, at: new Date().toISOString() };
}
