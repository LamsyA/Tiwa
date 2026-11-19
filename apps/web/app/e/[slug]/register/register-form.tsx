'use client';

import { Button, Input, MoneyText } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { reserveAction } from './actions.js';

/**
 * Buyer details + confirm. Fields are read from the form when Confirm is
 * tapped (not only from React state), so typing or autofill before the page
 * finishes loading on a slow phone still works; anything missing is named.
 */
export function RegisterForm(props: {
  slug: string;
  currency: string;
  selection: { typeId: string; name: string; priceMinor: string; qty: number }[];
  questions: { key: string; label: string; required: boolean }[];
}) {
  const t = useTranslations('register');
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const total = props.selection.reduce((sum, row) => sum + BigInt(row.priceMinor) * BigInt(row.qty), 0n);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const data = new FormData(form.current ?? undefined);
    const field = (key: string) => String(data.get(key) ?? '').trim();
    const name = field('name');
    const email = field('email');
    if (!name) return setError(t('missingName'));
    if (!email) return setError(t('missingEmail'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError(t('badEmail'));
    const answers: Record<string, string> = {};
    for (const question of props.questions) {
      const value = field(`q:${question.key}`);
      if (question.required && !value) return setError(question.label);
      if (value) answers[question.key] = value;
    }
    const phone = field('phone');
    const promo = field('promo');
    start(async () => {
      const result = await reserveAction({
        eventSlug: props.slug,
        items: props.selection.map((row) => ({ ticketTypeId: row.typeId, qty: row.qty })),
        buyerName: name,
        buyerEmail: email,
        buyerPhone: phone || undefined,
        promoCode: promo || undefined,
        answers,
      });
      if (!result.ok) {
        setError(
          result.code === 'VALIDATION' ? t('promoInvalid') : result.code === 'CONFLICT' ? t('soldOut') : t('expired'),
        );
        return;
      }
      if (result.data.free) {
        window.location.href = `/t/${result.data.tickets[0]}`;
      } else {
        window.location.href = `/e/${props.slug}/register/pending?order=${result.data.orderId}`;
      }
    });
  };

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-3">
      <ul className="border-border/70 bg-surface flex flex-col gap-2 rounded-2xl border p-4 text-sm">
        {props.selection.map((row) => (
          <li key={row.typeId} className="flex justify-between gap-3">
            <span>
              {row.name} × {row.qty}
            </span>
            <span className="font-medium tabular-nums">
              {row.priceMinor === '0' ? (
                'Free'
              ) : (
                <MoneyText value={(BigInt(row.priceMinor) * BigInt(row.qty)).toString()} currency={props.currency} />
              )}
            </span>
          </li>
        ))}
        {total > 0n && (
          <li className="border-border/60 flex justify-between gap-3 border-t pt-2 font-semibold">
            <span>{t('total')}</span>
            <MoneyText value={total.toString()} currency={props.currency} />
          </li>
        )}
      </ul>
      <Input name="name" aria-label={t('name')} placeholder={t('name')} autoComplete="name" />
      <Input name="email" aria-label={t('email')} placeholder={t('email')} inputMode="email" autoComplete="email" />
      <Input name="phone" aria-label={t('phone')} placeholder={t('phone')} inputMode="tel" autoComplete="tel" />
      <Input name="promo" aria-label={t('promo')} placeholder={t('promo')} />
      {props.questions.map((question) => (
        <Input
          key={question.key}
          name={`q:${question.key}`}
          aria-label={question.label}
          placeholder={`${question.label}${question.required ? ' *' : ''}`}
        />
      ))}
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t('pay')}
      </Button>
      <p className="text-muted text-xs">{t('freeNote')}</p>
    </form>
  );
}
