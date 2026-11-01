'use client';

import { Banner, Button, Card, ConfirmDialog, MoneyText, StatusPill } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { confirmOfflineAction, declineOfflineAction, receiptUrlAction } from '../events/[id]/bookings/actions.js';

export interface PendingPaymentRow {
  id: string;
  amountMinor: string;
  currency: string;
  paidAt: string | null;
  offlineMethod: string | null;
  note: string | null;
  hasReceipt: boolean;
  milestone: { label: string; booking: { id: string; event: { name: string } } } | null;
}

/** Vendor confirms offline payments (P8-T08, UF-17 step 5): "Confirm received" or "Not received". */
export function PaymentCards({ payments }: { payments: PendingPaymentRow[] }) {
  const t = useTranslations('payments');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState<string | null>(null);

  async function onAnswer(paymentId: string, received: boolean) {
    setError(null);
    setWorking(paymentId);
    const result = await (received ? confirmOfflineAction : declineOfflineAction)({ paymentId });
    setWorking(null);
    if (!result.ok) setError(t.has(`errors.${result.code}`) ? t(`errors.${result.code}`) : t('errors.generic'));
    else router.refresh();
  }

  async function openReceipt(paymentId: string) {
    const result = await receiptUrlAction({ paymentId });
    if (result.ok) window.open(result.data.url, '_blank', 'noopener');
  }

  if (payments.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="payments-to-confirm">
      <h2 id="payments-to-confirm" className="font-medium">
        {t('toConfirmHeading')}
      </h2>
      {error && <Banner tone="danger">{error}</Banner>}
      <ul className="flex flex-col gap-2">
        {payments.map((row) => (
          <li key={row.id}>
            <Card>
              <div className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex items-center gap-2">
                  <p className="flex-1 font-medium">
                    {row.milestone?.booking.event.name} · {row.milestone?.label}
                  </p>
                  <StatusPill tone="brand">{t('state.RECORDED_OFFLINE')}</StatusPill>
                </div>
                <p>
                  <MoneyText value={row.amountMinor} currency={row.currency} />
                  {row.offlineMethod &&
                    ` · ${t.has(`method.${row.offlineMethod}`) ? t(`method.${row.offlineMethod}`) : ''}`}
                  {row.paidAt && ` · ${new Date(row.paidAt).toLocaleDateString()}`}
                </p>
                {row.note && <p className="text-muted">{row.note}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={working === row.id} onClick={() => void onAnswer(row.id, true)}>
                    {t('confirmReceived')}
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="secondary" disabled={working === row.id}>
                        {t('notReceived')}
                      </Button>
                    }
                    title={t('notReceivedTitle')}
                    body={t('notReceivedBody')}
                    confirmLabel={t('notReceived')}
                    onConfirm={() => void onAnswer(row.id, false)}
                  />
                  {row.hasReceipt && (
                    <Button variant="ghost" onClick={() => void openReceipt(row.id)}>
                      {t('viewReceipt')}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
