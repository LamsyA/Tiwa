import { env } from '@tiwa/config';
import { syncEventTeamThread } from '@tiwa/core';
import * as Sentry from '@sentry/nextjs';

// D-X20: a deployment without the worker sets INLINE_JOBS=1, and the web app
// runs the outbox topics that matter for core flows right after the action.
// The outbox row is still written, so adding the worker later just re-runs
// these idempotent handlers. Anything slow or bulky (invite fan-out, CSV
// import, media) is deliberately NOT here — those features need the worker.

export type InlineTopic = 'event.finalized' | 'event.members.changed';

export function inlineJobsEnabled(source: { INLINE_JOBS?: string | undefined } = env): boolean {
  return source.INLINE_JOBS === '1';
}

const HANDLERS: Record<InlineTopic, (payload: { eventId: string }) => Promise<unknown>> = {
  'event.finalized': ({ eventId }) => syncEventTeamThread(eventId),
  'event.members.changed': ({ eventId }) => syncEventTeamThread(eventId),
};

/** Never fails the user's action: errors are reported and the outbox row remains for a worker. */
export async function runInline(topic: InlineTopic, payload: { eventId: string }): Promise<void> {
  if (!inlineJobsEnabled()) return;
  try {
    await HANDLERS[topic](payload);
  } catch (error) {
    Sentry.captureException(error, { tags: { inlineTopic: topic } });
  }
}
