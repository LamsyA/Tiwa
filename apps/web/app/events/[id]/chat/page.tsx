import { syncEventTeamThread } from '@tiwa/core';
import { redirect } from 'next/navigation';
import { loadEventPage } from '@/components/event-frame.js';

/**
 * The event's team chat (UF-30 entry point): members only. Syncing here makes
 * sure the thread exists and matches the team even when no worker runs (D-X20).
 */
export default async function EventTeamChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await loadEventPage(id, '/chat');
  if (!['HOST', 'CO_HOST', 'PLANNER', 'PLANNER_STAFF'].includes(access.role)) redirect(`/events/${id}`);
  const { threadId } = await syncEventTeamThread(id);
  redirect(`/inbox/${threadId}`);
}
