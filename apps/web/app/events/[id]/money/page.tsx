import { prisma } from '@tiwa/db';
import { Card, MoneyText } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { EventFrame, Forbidden, loadEventPage } from '@/components/event-frame.js';

/**
 * Money section. P3 shows the planned budget by category (from the template);
 * expenses, payments and contributions arrive in P8/P9. Guarded by money.view:
 * a View only member gets the 403 panel and no figures (UF-04-1).
 */
export default async function EventMoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, access, allowed, invitesOn } = await loadEventPage(id, '/money', 'money.view');
  const t = await getTranslations('events.money');
  const event = await prisma.event.findUniqueOrThrow({
    where: { id },
    select: { name: true, currency: true, plannedBudgetMinor: true },
  });
  const categories = allowed
    ? await prisma.budgetCategory.findMany({ where: { eventId: id }, orderBy: { sortOrder: 'asc' } })
    : [];

  return (
    <EventFrame
      eventId={id}
      userId={ctx.actor.userId}
      access={access}
      invitesOn={invitesOn}
      active="money"
      title={event.name}
    >
      {!allowed ? (
        <Forbidden eventId={id} />
      ) : (
        <div className="flex flex-col gap-4 py-2">
          <Card className="flex flex-col gap-1 p-4">
            <p className="text-muted text-sm">{t('planned')}</p>
            <p className="font-display text-2xl font-bold">
              <MoneyText value={event.plannedBudgetMinor.toString()} currency={event.currency} />
            </p>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 font-medium">{t('categoriesHeading')}</h2>
            {categories.length === 0 ? (
              <p className="text-muted text-sm">{t('empty')}</p>
            ) : (
              <ul className="divide-border divide-y">
                {categories.map((category) => (
                  <li key={category.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{category.label}</span>
                    <MoneyText value={category.plannedMinor.toString()} currency={event.currency} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="text-muted text-sm">{t('comingSoon')}</p>
        </div>
      )}
    </EventFrame>
  );
}
