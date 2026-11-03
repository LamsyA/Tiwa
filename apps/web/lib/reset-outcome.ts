/**
 * Better Auth awaits `sendResetPassword` but swallows its errors (it only
 * logs them), so a failed send looked like success (D-X53). The hook records
 * each outcome here and the forgot-password route reads it back.
 */
const outcomes = new Map<string, { ok: boolean; at: number }>();

export function recordResetOutcome(email: string, ok: boolean): void {
  outcomes.set(email.toLowerCase(), { ok, at: Date.now() });
}

/** The outcome recorded for `email` since `since`, then forgotten. */
export function takeResetOutcome(email: string, since: number): boolean | null {
  const key = email.toLowerCase();
  const hit = outcomes.get(key);
  outcomes.delete(key);
  return hit && hit.at >= since ? hit.ok : null;
}
