import { FORMAT_RULES, eventTypeCards, getEventType, suggestEventName, type EventFormat } from '@tiwa/config';
import { WIZARD_STEPS, loadEventAccess, utcToZoned, type WizardStep } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/app-frame.js';
import { requirePageUser } from '@/lib/ctx.js';
import { Wizard, type WizardDraft } from './wizard.js';

/** UF-03: `/events/new?step=type`, then `?id=…&step=basics|venue|guests|features`. Reload resumes (UF-03-2). */
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; step?: string }>;
}) {
  const { id, step: stepParam } = await searchParams;
  const ctx = await requirePageUser(id ? `/events/new?id=${id}` : '/events/new');
  const t = await getTranslations('events');
  const formats = (Object.keys(FORMAT_RULES) as EventFormat[]).map((key) => ({ key, label: FORMAT_RULES[key].label }));

  let draft: WizardDraft | null = null;
  let step: WizardStep = 'type';
  if (id) {
    const access = await loadEventAccess(ctx.actor.userId, id);
    const event = access
      ? await prisma.event.findUnique({ where: { id }, include: { days: { orderBy: { sortOrder: 'asc' } } } })
      : null;
    if (!event || event.status !== 'DRAFT') redirect(event ? `/events/${event.id}` : '/events/new');
    const template = getEventType(event.type);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: ctx.actor.userId },
      select: { name: true, phone: true },
    });
    const firstName = user.name === user.phone ? '' : (user.name.split(/\s+/)[0] ?? '');
    const start = event.startsAt ? utcToZoned(event.startsAt, event.timezone) : null;
    const end = event.endsAt ? utcToZoned(event.endsAt, event.timezone) : null;
    const rules = FORMAT_RULES[event.format];
    draft = {
      id: event.id,
      typeLabel: template?.label ?? event.type,
      // Untouched drafts carry the template label; offer the personal suggestion instead.
      name: template && event.name === template.label ? suggestEventName(template, firstName) : event.name,
      date: start?.date ?? '',
      startTime: start?.time ?? '',
      endTime: end?.time ?? '',
      days: event.days.map((day) => ({
        date: day.date.toISOString().slice(0, 10),
        title: day.title ?? '',
        venueName: day.venueName ?? '',
        address: day.address ?? '',
      })),
      expectedGuests: event.expectedGuests ? String(event.expectedGuests) : '',
      budgetMinor: event.plannedBudgetMinor.toString(),
      currency: event.currency,
      visibility: event.visibility,
      visibilities: rules.visibilities,
      ticketsAllowed: rules.ticketsAllowed,
      features: { invites: event.invitesEnabled, moments: event.momentsEnabled, tickets: event.ticketsEnabled },
    };
    const requested = WIZARD_STEPS.find((candidate) => candidate === stepParam && candidate !== 'type');
    const saved = WIZARD_STEPS.find((candidate) => candidate === event.wizardStep);
    step = requested ?? saved ?? 'basics';
  }

  return (
    <AppFrame userId={ctx.actor.userId} active="events" title={t('newTitle')}>
      <Wizard step={step} draft={draft} types={eventTypeCards()} formats={formats} />
    </AppFrame>
  );
}
