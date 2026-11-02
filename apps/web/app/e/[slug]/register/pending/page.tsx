import { prisma } from '@tiwa/db';
import { Banner, Card, GuestShell } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** Paid-order pending page (lean P8): organiser collects outside Tiwa, then confirms. */
export default async function PendingPage({
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const query = await searchParams;
  const t = await getTranslations('register');
  const order = query.order
    ? await prisma.ticketOrder.findUnique({ where: { id: query.order } }).catch(() => null)
    : null;
  if (!order) notFound();
  return (
    <GuestShell title={t('title')}>
      <Card className="flex flex-col gap-3 p-4">
        <h1 className="font-display text-xl font-bold">{t('orderConfirmed')}</h1>
        <Banner tone="info">{t('paidNote')}</Banner>
        <p className="text-muted text-sm">{t('reservedFor', { minutes: 10 })}</p>
      </Card>
    </GuestShell>
  );
}
