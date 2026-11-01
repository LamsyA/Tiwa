import { Card, MoneyText, StatusPill } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';

export interface VendorBookingRow {
  id: string;
  status: string;
  currency: string;
  eventName: string;
  startsAt: string | null;
  securedMinor: string;
  awaitingMinor: string;
  outstandingMinor: string;
}

/** Vendor payment status per booking (P8-T16, lean D-X27): paid, awaiting confirmation, still to pay. */
export async function BookingMoneyList({ bookings }: { bookings: VendorBookingRow[] }) {
  const t = await getTranslations('payments');
  if (bookings.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="vendor-bookings">
      <h2 id="vendor-bookings" className="font-medium">
        {t('bookingsHeading')}
      </h2>
      <ul className="flex flex-col gap-2">
        {bookings.map((row) => (
          <li key={row.id}>
            <Card>
              <div className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  <p className="font-medium">{row.eventName}</p>
                  <StatusPill tone={row.status === 'CONFIRMED' ? 'success' : 'neutral'}>{row.status}</StatusPill>
                </div>
                <dl className="text-muted grid grid-cols-3 gap-3">
                  {(
                    [
                      ['secured', row.securedMinor],
                      ['awaiting', row.awaitingMinor],
                      ['outstanding', row.outstandingMinor],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <dt className="text-xs">{t(key)}</dt>
                      <dd className="font-medium">
                        <MoneyText value={value} currency={row.currency} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
