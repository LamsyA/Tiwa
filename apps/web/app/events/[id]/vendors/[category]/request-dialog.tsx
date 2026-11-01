'use client';

import { Banner, Button, Card, Checkbox, MoneyInput, Textarea } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { requestQuotesAction } from '../actions.js';

export function RequestDialog({
  eventId,
  category,
  vendors,
}: {
  eventId: string;
  category: string;
  vendors: { orgId: string; name: string; city: string; startingPriceMinor: string | null; currency: string }[];
}) {
  const t = useTranslations('quotes');
  const te = useTranslations('quotes.errors');
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState('');
  const [budget, setBudget] = React.useState('0');
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  async function onSend() {
    setError(null);
    setSending(true);
    try {
      const result = await requestQuotesAction({
        eventId,
        category,
        vendorOrgIds: picked,
        notes: notes || undefined,
        budgetMaxMinor: budget && budget !== '0' ? budget : undefined,
      });
      if (!result.ok) setError(te(result.code as 'VALIDATION'));
      else {
        setPicked([]);
        setNotes('');
        router.refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-muted text-sm">{t('requestBody')}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <ul className="flex flex-col gap-2">
          {vendors.map((vendor) => (
            <li key={vendor.orgId}>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={picked.includes(vendor.orgId)}
                  onCheckedChange={(checked) =>
                    setPicked(
                      checked ? [...picked, vendor.orgId].slice(0, 5) : picked.filter((id) => id !== vendor.orgId),
                    )
                  }
                />
                <span className="flex-1">
                  {vendor.name} · {vendor.city}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <label className="flex flex-col gap-1 text-sm">
          {t('notesLabel')}
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('notesPlaceholder')} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t('budgetLabel')}
          <MoneyInput currency={vendors[0]?.currency ?? 'NGN'} value={budget} onValueChange={setBudget} />
        </label>
        <Button disabled={sending || picked.length === 0} onClick={() => void onSend()}>
          {t('sendRequests')} ({picked.length})
        </Button>
      </div>
    </Card>
  );
}
