import { getPublicEvent } from '@tiwa/core';
import { Banner, Card, GuestShell } from '@tiwa/ui';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { RegisterForm } from './register-form.js';

/** `/e/[slug]/register` — order summary, buyer fields, questions, promo, pay/confirm. */
export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const t = await getTranslations('register');
  const data = await getPublicEvent(slug).catch(() => null);
  if (!data) notFound();
  const raw = query.t;
  const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((entry) =>
    entry
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const selection = picked
    .map((part) => {
      const [id, countRaw] = part.split(':');
      const qty = Number(countRaw);
      const type = data.types.find((row) => row.id === id);
      if (!type || !Number.isInteger(qty) || qty < 1) return null;
      return { type, qty: Math.min(qty, type.maxPerOrder, Math.max(0, type.available)) };
    })
    .filter((row): row is { type: (typeof data.types)[number]; qty: number } => row !== null && row.qty > 0);
  return (
    <GuestShell title={t('title')}>
      <div className="flex flex-col gap-4 py-4">
        <Card className="flex flex-col gap-2 p-4">
          <h1 className="font-display text-xl font-bold">{data.event.name}</h1>
          {selection.length === 0 && <Banner tone="warning">{t('soldOut')}</Banner>}
        </Card>
        {selection.length > 0 && (
          <RegisterForm
            slug={slug}
            currency={data.event.currency}
            selection={selection.map(({ type, qty }) => ({
              typeId: type.id,
              name: type.name,
              priceMinor: type.priceMinor,
              qty,
            }))}
            questions={(data.event.registrationQuestions ?? []) as { key: string; label: string; required: boolean }[]}
          />
        )}
      </div>
    </GuestShell>
  );
}
