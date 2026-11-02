'use client';

import { Button, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { reserveAction } from './actions.js';

export function RegisterForm(props: {
  slug: string;
  currency: string;
  selection: { typeId: string; name: string; priceMinor: string; qty: number }[];
  questions: { key: string; label: string; required: boolean }[];
}) {
  const t = useTranslations('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [promo, setPromo] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    for (const question of props.questions) {
      if (question.required && !answers[question.key]?.trim()) {
        setError(question.label);
        return;
      }
    }
    start(async () => {
      const result = await reserveAction({
        eventSlug: props.slug,
        items: props.selection.map((row) => ({ ticketTypeId: row.typeId, qty: row.qty })),
        buyerName: name.trim(),
        buyerEmail: email.trim(),
        buyerPhone: phone.trim() || undefined,
        promoCode: promo.trim() || undefined,
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
    <div className="flex flex-col gap-3">
      {props.selection.map((row) => (
        <p key={row.typeId} className="flex justify-between text-sm">
          <span>
            {row.name} × {row.qty}
          </span>
          <span>
            {row.priceMinor === '0' ? 'Free' : `${BigInt(row.priceMinor) * BigInt(row.qty)} ${props.currency}`}
          </span>
        </p>
      ))}
      <Input
        aria-label={t('name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t('name')}
      />
      <Input
        aria-label={t('email')}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t('email')}
        inputMode="email"
      />
      <Input
        aria-label={t('phone')}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder={t('phone')}
        inputMode="tel"
      />
      <Input
        aria-label={t('promo')}
        value={promo}
        onChange={(event) => setPromo(event.target.value)}
        placeholder={t('promo')}
      />
      {props.questions.map((question) => (
        <Input
          key={question.key}
          aria-label={question.label}
          value={answers[question.key] ?? ''}
          onChange={(event) => setAnswers((prev) => ({ ...prev, [question.key]: event.target.value }))}
          placeholder={`${question.label}${question.required ? ' *' : ''}`}
        />
      ))}
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button disabled={pending || !name.trim() || !email.trim()} onClick={submit}>
        {t('pay')}
      </Button>
      <p className="text-muted text-xs">{t('freeNote')}</p>
    </div>
  );
}
