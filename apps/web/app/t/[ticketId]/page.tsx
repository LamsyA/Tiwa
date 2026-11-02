import { ticketView } from '@tiwa/core';
import { Card, DateText, GuestShell, QRCode } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

/** `/t/[ticketId]` ticket card with QR (TKT-07). */
export default async function TicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const t = await getTranslations('ticketView');
  const data = await ticketView(ticketId).catch(() => null);
  if (!data) notFound();
  return (
    <GuestShell title={data.event.name}>
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <p className="font-medium">
          {t('holder')}: {data.ticket.holderName}
        </p>
        <QRCode
          value={data.qr}
          size={224}
          label={data.event.name}
          className="text-text max-w-60 rounded-md border p-2"
        />
        <Card className="w-full p-4">
          <p className="font-display text-lg font-bold">{data.event.name}</p>
          {data.event.startsAt && (
            <DateText value={data.event.startsAt} format="datetime" timeZone={data.event.timezone} />
          )}
        </Card>
        <p className="text-muted text-sm">{t('showAtDoor')}</p>
      </div>
    </GuestShell>
  );
}
