'use client';

import {
  addDepAction,
  createContactAction,
  createItemAction,
  deleteContactAction,
  deleteItemAction,
  fromProgrammeAction,
  logIncidentAction,
  markLateAction,
  removeDepAction,
  resolveIncidentAction,
  updateItemAction,
  updateStatusAction,
} from './actions.js';

/** Offline mutation queue (P12-T06): serializable day edits stashed in
 * localStorage while offline and replayed through the same server actions
 * when the device is back online. The served-offline shell (SW day-pages
 * cache) renders the last-visited timeline; the queue carries the diff. */

export type DayMutation =
  | { kind: 'status'; itemId: string; status: 'PLANNED' | 'STARTED' | 'DONE' | 'SKIPPED' }
  | { kind: 'late'; itemId: string; lateByMin: number }
  | { kind: 'item-create'; title: string; startsAt: string; durationMin: number }
  | {
      kind: 'item-update';
      itemId: string;
      title: string;
      startsAt: string;
      durationMin: number;
      ownerUserId: string | null;
      ownerOrgId: string | null;
    }
  | { kind: 'item-delete'; itemId: string }
  | { kind: 'dep-add'; itemId: string; dependsOnId: string }
  | { kind: 'dep-remove'; itemId: string; dependsOnId: string }
  | { kind: 'from-programme' }
  | {
      kind: 'incident-log';
      title: string;
      details?: string | undefined;
      severity: 'low' | 'normal' | 'high';
      ownerUserId: string | null;
    }
  | { kind: 'incident-resolve'; incidentId: string; resolution?: string | undefined }
  | { kind: 'contact-create'; name: string; role: string; phone: string; isBackupVendor: boolean }
  | { kind: 'contact-delete'; contactId: string };

const queueKey = (eventId: string) => `day-queue:${eventId}`;
const snapshotKey = (eventId: string) => `day-snapshot:${eventId}`;

export function loadQueue(eventId: string): DayMutation[] {
  try {
    const raw = localStorage.getItem(queueKey(eventId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as DayMutation[]).slice(0, 200) : [];
  } catch {
    return [];
  }
}

export function queueMutation(eventId: string, mutation: DayMutation): number {
  const queue = [...loadQueue(eventId), mutation].slice(-200);
  try {
    localStorage.setItem(queueKey(eventId), JSON.stringify(queue));
  } catch {
    // storage full or blocked — the edit is dropped but the online path retries
  }
  return queue.length;
}

export function saveSnapshot(eventId: string, data: unknown): void {
  try {
    localStorage.setItem(snapshotKey(eventId), JSON.stringify({ savedAt: new Date().toISOString(), data }));
  } catch {
    // best effort
  }
}

export function loadSnapshotAt(eventId: string): string | null {
  try {
    const raw = localStorage.getItem(snapshotKey(eventId));
    if (!raw) return null;
    return (JSON.parse(raw) as { savedAt?: string }).savedAt ?? null;
  } catch {
    return null;
  }
}

/** Replay queued edits in order; stops at the first failure and keeps the
 * remainder queued. Returns the leftover count. */
export async function replayQueue(eventId: string): Promise<{ ok: boolean; left: number }> {
  const queue = loadQueue(eventId);
  const remaining: DayMutation[] = [];
  for (const mutation of queue) {
    const result = await runMutation(eventId, mutation);
    if (!result) {
      remaining.push(mutation, ...queue.slice(queue.indexOf(mutation) + 1));
      break;
    }
  }
  try {
    localStorage.setItem(queueKey(eventId), JSON.stringify(remaining));
  } catch {
    // best effort
  }
  return { ok: remaining.length === 0, left: remaining.length };
}

async function runMutation(eventId: string, mutation: DayMutation): Promise<boolean> {
  switch (mutation.kind) {
    case 'status':
      return (await updateStatusAction({ eventId, itemId: mutation.itemId, status: mutation.status })).ok;
    case 'late':
      return (await markLateAction({ eventId, itemId: mutation.itemId, lateByMin: mutation.lateByMin })).ok;
    case 'item-create':
      return (
        await createItemAction({
          eventId,
          title: mutation.title,
          startsAt: mutation.startsAt,
          durationMin: mutation.durationMin,
        })
      ).ok;
    case 'item-update':
      return (
        await updateItemAction({
          eventId,
          itemId: mutation.itemId,
          title: mutation.title,
          startsAt: mutation.startsAt,
          durationMin: mutation.durationMin,
          ownerUserId: mutation.ownerUserId,
          ownerOrgId: mutation.ownerOrgId,
        })
      ).ok;
    case 'item-delete':
      return (await deleteItemAction({ eventId, itemId: mutation.itemId })).ok;
    case 'dep-add':
      return (await addDepAction({ eventId, itemId: mutation.itemId, dependsOnId: mutation.dependsOnId })).ok;
    case 'dep-remove':
      return (await removeDepAction({ eventId, itemId: mutation.itemId, dependsOnId: mutation.dependsOnId })).ok;
    case 'from-programme':
      return (await fromProgrammeAction({ eventId })).ok;
    case 'incident-log':
      return (
        await logIncidentAction({
          eventId,
          title: mutation.title,
          details: mutation.details,
          severity: mutation.severity,
          ownerUserId: mutation.ownerUserId,
        })
      ).ok;
    case 'incident-resolve':
      return (
        await resolveIncidentAction({ eventId, incidentId: mutation.incidentId, resolution: mutation.resolution })
      ).ok;
    case 'contact-create':
      return (
        await createContactAction({
          eventId,
          name: mutation.name,
          role: mutation.role,
          phone: mutation.phone,
          isBackupVendor: mutation.isBackupVendor,
        })
      ).ok;
    case 'contact-delete':
      return (await deleteContactAction({ eventId, contactId: mutation.contactId })).ok;
  }
}
