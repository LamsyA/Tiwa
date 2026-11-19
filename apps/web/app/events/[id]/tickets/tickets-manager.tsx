'use client';

import { Button, Card, Input, MoneyText, Switch, cn } from '@tiwa/ui';
import { Check, CheckCircle2, Circle, Copy, ExternalLink, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import {
  cancelOrderAction,
  confirmOrderOfflineAction,
  createPromoAction,
  createTypeAction,
  deletePromoAction,
  deleteTypeAction,
  saveTicketsSettings,
  updateTypeAction,
} from './actions.js';

interface TypeRow {
  id: string;
  name: string;
  description: string | null;
  priceMinor: string;
  quantity: number;
  maxPerOrder: number;
  salesStart: string | null;
  salesEnd: string | null;
  sold: number;
  reserved: number;
}
interface PromoRow {
  id: string;
  code: string;
  percentOff: number | null;
  amountOffMinor: string | null;
  maxUses: number | null;
  used: number;
  expiresAt: string | null;
}
interface OrderRow {
  id: string;
  buyerName: string;
  buyerEmail: string;
  status: string;
  totalMinor: string;
  createdAt: string;
  reservedUntil: string;
}

export function TicketsManager(props: {
  eventId: string;
  currency: string;
  canManage: boolean;
  ticketsEnabled: boolean;
  ticketsPublished: boolean;
  registrationQuestions: { key: string; label: string; required: boolean }[];
  types: TypeRow[];
  promos: PromoRow[];
  orders: OrderRow[];
  eventName: string;
  publicUrl: string;
  eventReady: boolean;
  visibilityOk: boolean;
}) {
  const t = useTranslations('tickets');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('0');
  const [qty, setQty] = useState('100');
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('10');
  const [questions, setQuestions] = useState(props.registrationQuestions);
  const [qKey, setQKey] = useState('');
  const [qLabel, setQLabel] = useState('');
  const [qRequired, setQRequired] = useState(false);

  if (!props.canManage) return null;

  const run = (fn: () => Promise<{ ok: boolean; reason?: string }>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) {
        const key = result.reason && t.has(`errors.${result.reason}`) ? result.reason : 'saveFailed';
        setError(t(`errors.${key}` as 'errors.saveFailed'));
      }
    });
  };

  const saveQuestions = (next: typeof questions) => {
    setQuestions(next);
    run(() =>
      saveTicketsSettings({
        eventId: props.eventId,
        ticketsEnabled: props.ticketsEnabled,
        ticketsPublished: props.ticketsPublished,
        registrationQuestions: next,
      }),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <SetupCard {...props} />
      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold tracking-tight">{t('settings')}</h3>
        <label className="flex items-center justify-between gap-3 text-sm">
          {t('enableTickets')}
          <Switch
            checked={props.ticketsEnabled}
            disabled={pending}
            onCheckedChange={(on) =>
              run(() =>
                saveTicketsSettings({
                  eventId: props.eventId,
                  ticketsEnabled: on,
                  ticketsPublished: on ? props.ticketsPublished : false,
                  registrationQuestions: props.registrationQuestions,
                }),
              )
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          {t('publishPage')}
          <Switch
            checked={props.ticketsPublished}
            disabled={pending || !props.ticketsEnabled}
            onCheckedChange={(on) =>
              run(() =>
                saveTicketsSettings({
                  eventId: props.eventId,
                  ticketsEnabled: props.ticketsEnabled,
                  ticketsPublished: on,
                  registrationQuestions: props.registrationQuestions,
                }),
              )
            }
          />
        </label>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold tracking-tight">{t('types')}</h3>
        {props.types.length === 0 && <p className="text-muted text-sm">{t('emptyTypes')}</p>}
        {props.types.map((row) => (
          <TypeRowEditor key={row.id} row={row} currency={props.currency} pending={pending} run={run} />
        ))}
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t('typeName')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('typeName')}
            className="min-w-32 flex-1"
          />
          <Input
            aria-label={t('price')}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={t('price')}
            inputMode="numeric"
            className="w-28"
          />
          <Input
            aria-label={t('quantity')}
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            placeholder={t('quantity')}
            inputMode="numeric"
            className="w-24"
          />
          <Button
            disabled={pending || !name.trim() || toMinor(price) === null}
            onClick={() =>
              run(() =>
                createTypeAction({
                  eventId: props.eventId,
                  name: name.trim(),
                  priceMinor: toMinor(price) ?? '0',
                  quantity: Number(qty) || 100,
                  maxPerOrder: 10,
                }),
              )
            }
          >
            {t('addType')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold tracking-tight">{t('promos')}</h3>
        {props.promos.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono font-medium">{row.code}</span>
            <span className="text-muted">
              {row.percentOff != null ? (
                `${row.percentOff}%`
              ) : (
                <MoneyText value={row.amountOffMinor ?? '0'} currency={props.currency} />
              )}{' '}
              · {row.used}
              {row.maxUses != null ? `/${row.maxUses}` : ''} {t('used')}
            </span>
            <span className="ml-auto" />
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => deletePromoAction({ promoId: row.id }))}
            >
              {t('delete')}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label={t('code')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('code')}
            className="min-w-32 flex-1"
          />
          <Input
            aria-label={t('percentOff')}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            placeholder={t('percentOff')}
            inputMode="numeric"
            className="w-24"
          />
          <Button
            disabled={pending || !code.trim()}
            onClick={() =>
              run(() =>
                createPromoAction({ eventId: props.eventId, code: code.trim(), percentOff: Number(percent) || 10 }),
              )
            }
          >
            {t('addPromo')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold tracking-tight">{t('questions')}</h3>
        {questions.map((question) => (
          <div key={question.key} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{question.label}</span>
            <span className="text-muted">
              {question.key}
              {question.required ? ' *' : ''}
            </span>
            <span className="ml-auto" />
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => saveQuestions(questions.filter((row) => row.key !== question.key))}
            >
              {t('removeQuestion')}
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={t('questionKey')}
            value={qKey}
            onChange={(event) => setQKey(event.target.value)}
            placeholder={t('questionKey')}
            className="min-w-28 flex-1"
          />
          <Input
            aria-label={t('questionLabel')}
            value={qLabel}
            onChange={(event) => setQLabel(event.target.value)}
            placeholder={t('questionLabel')}
            className="min-w-32 flex-1"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={qRequired} onChange={(event) => setQRequired(event.target.checked)} />
            {t('questionRequired')}
          </label>
          <Button
            disabled={pending || !qKey.trim() || !qLabel.trim() || questions.some((row) => row.key === qKey.trim())}
            onClick={() => {
              saveQuestions([...questions, { key: qKey.trim(), label: qLabel.trim(), required: qRequired }]);
              setQKey('');
              setQLabel('');
              setQRequired(false);
            }}
          >
            {t('addQuestion')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h3 className="font-display text-base font-bold tracking-tight">{t('orders')}</h3>
        {props.orders.length === 0 && <p className="text-muted text-sm">—</p>}
        <ul className="flex flex-col gap-1">
          {props.orders.slice(0, 20).map((row) => (
            <li
              key={row.id}
              data-buyer={row.buyerName}
              className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm"
            >
              <span className="font-medium">{row.buyerName}</span>
              <span className="text-muted">
                {t.has(`status${row.status}`) ? t(`status${row.status}` as 'statusPAID') : row.status} ·{' '}
                <MoneyText value={row.totalMinor} currency={props.currency} /> · {t('reference')}{' '}
                {row.id.slice(-8).toUpperCase()}
              </span>
              <span className="ml-auto flex gap-2">
                {row.status === 'RESERVED' && (
                  <Button disabled={pending} onClick={() => run(() => confirmOrderOfflineAction({ orderId: row.id }))}>
                    {t('confirmOffline')}
                  </Button>
                )}
                {row.status === 'RESERVED' && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => cancelOrderAction({ orderId: row.id }))}
                  >
                    {t('cancelOrder')}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** One ticket type row: inline price/quantity edit until sales start, then locked (core enforces too). */
function TypeRowEditor(props: {
  row: TypeRow;
  currency: string;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; reason?: string }>) => void;
}) {
  const t = useTranslations('tickets');
  const { row } = props;
  const locked = row.sold + row.reserved > 0;
  const [price, setPrice] = useState(toMajor(row.priceMinor));
  const [qty, setQty] = useState(String(row.quantity));
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
      <span className="font-medium">{row.name}</span>
      <span className="text-muted">
        {row.priceMinor === '0' ? t('free') : <MoneyText value={row.priceMinor} currency={props.currency} />} ·{' '}
        {row.sold}/{row.quantity} {t('sold')} · {row.reserved} {t('reserved')}
      </span>
      <span className="ml-auto" />
      {!locked && (
        <>
          <Input
            aria-label={`${t('price')} · ${row.name}`}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="numeric"
            className="w-24"
          />
          <Input
            aria-label={`${t('quantity')} · ${row.name}`}
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            inputMode="numeric"
            className="w-20"
          />
          <Button
            variant="secondary"
            disabled={props.pending || toMinor(price) === null || !/^\d+$/.test(qty)}
            onClick={() =>
              props.run(() =>
                updateTypeAction({ ticketTypeId: row.id, priceMinor: toMinor(price) ?? '0', quantity: Number(qty) }),
              )
            }
          >
            {t('save')}
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        disabled={props.pending || locked}
        onClick={() => props.run(() => deleteTypeAction({ ticketTypeId: row.id }))}
      >
        {t('delete')}
      </Button>
    </div>
  );
}

/** Naira (major units, "15000" or "15,000.50") → kobo string; null when not a price. */
function toMinor(value: string): string | null {
  const clean = value.replace(/[,\s₦]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', frac = ''] = clean.split('.');
  return (BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2))).toString();
}

function toMajor(minor: string): string {
  const value = BigInt(minor);
  const whole = value / 100n;
  const frac = value % 100n;
  return frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(2, '0')}`;
}

/** D-X110: the steps to a live ticket page, then the link to share. */
function SetupCard(props: {
  eventId: string;
  eventName: string;
  publicUrl: string;
  eventReady: boolean;
  visibilityOk: boolean;
  ticketsEnabled: boolean;
  ticketsPublished: boolean;
  types: TypeRow[];
}) {
  const t = useTranslations('tickets');
  const [copied, setCopied] = useState(false);
  const steps = [
    { key: 'stepEvent', done: props.eventReady, href: `/events/${props.eventId}` },
    { key: 'stepVisibility', done: props.visibilityOk, href: `/events/${props.eventId}/settings` },
    { key: 'stepEnable', done: props.ticketsEnabled },
    { key: 'stepTypes', done: props.types.length > 0 },
    { key: 'stepPublish', done: props.ticketsPublished },
  ] as const;
  const live = steps.every((step) => step.done);
  if (live) {
    const text = t('whatsAppText', { name: props.eventName, url: props.publicUrl });
    return (
      <Card className="border-success/30 bg-success/[0.05] flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="text-success mt-0.5 size-5 shrink-0" />
          <div>
            <h3 className="font-display text-base font-bold tracking-tight">{t('liveTitle')}</h3>
            <p className="text-muted text-sm">{t('liveBody')}</p>
          </div>
        </div>
        <p className="bg-surface border-border/70 truncate rounded-xl border px-3 py-2 font-mono text-sm">
          {props.publicUrl}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(props.publicUrl)
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
                .catch(() => undefined);
            }}
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            {copied ? t('copied') : t('copyLink')}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-semibold text-white"
          >
            <Share2 aria-hidden className="size-4" />
            {t('shareWhatsApp')}
          </a>
          <a
            href={props.publicUrl}
            target="_blank"
            rel="noreferrer"
            className="border-border inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
          >
            <ExternalLink aria-hidden className="size-4" />
            {t('viewPublic')}
          </a>
        </div>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-display text-base font-bold tracking-tight">{t('setupTitle')}</h3>
        <p className="text-muted text-sm">{t('setupBody')}</p>
      </div>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
              step.done ? 'text-muted' : 'bg-surface-2 font-medium',
            )}
          >
            {step.done ? (
              <CheckCircle2 aria-hidden className="text-success size-5 shrink-0" />
            ) : (
              <Circle aria-hidden className="text-muted size-5 shrink-0" />
            )}
            <span className={cn('flex-1', step.done && 'line-through')}>
              {index + 1}. {t(step.key)}
            </span>
            {!step.done && 'href' in step && (
              <Link href={step.href} className="text-brand-strong text-xs font-semibold hover:underline">
                {t('open')}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
