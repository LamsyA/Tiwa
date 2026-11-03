'use client';

import type { AudienceOption, BatchEstimate, GuestMessageDraft, InviteAudience, MessageStyle } from '@tiwa/core';
import { Banner, Button, MoneyText, ResponsiveDialog, Textarea, cn } from '@tiwa/ui';
import {
  ArrowLeft,
  Check,
  Mail,
  MessageCircle,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { draftAiMessageAction, estimateAiMessageAction, sendAiMessageAction } from './actions.js';

type Kind = GuestMessageDraft['kind'];
type Stage = 'ask' | 'drafting' | 'review' | 'sending' | 'sent';

const EXAMPLES = ['invite', 'remind', 'change', 'thanks'] as const;
const STYLES: MessageStyle[] = ['shorter', 'formal', 'warmer', 'pidgin'];
const KINDS: Kind[] = ['INVITE', 'UPDATE', 'REMINDER'];

function newKey() {
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One-prompt invites and updates (UF-27 step 3, D-X41). The host types one
 * instruction; the AI drafts the message and picks who gets it; the host
 * reviews, tweaks if they like, and taps Send once. Nothing leaves before
 * that tap, and the AI never sees guest names, phones or emails.
 */
export function AiComposer({ eventId, currency, appUrl }: { eventId: string; currency: string; appUrl: string }) {
  const t = useTranslations('events.invites.ai');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState<Stage>('ask');
  const [prompt, setPrompt] = React.useState('');
  const [language, setLanguage] = React.useState<'en' | 'pcm'>('en');
  const [draft, setDraft] = React.useState<GuestMessageDraft | null>(null);
  const [message, setMessage] = React.useState('');
  const [kind, setKind] = React.useState<Kind>('INVITE');
  const [audienceKey, setAudienceKey] = React.useState('all');
  const [estimate, setEstimate] = React.useState<BatchEstimate | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [rewriting, setRewriting] = React.useState<MessageStyle | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<{ queued: number } | null>(null);
  const idempotencyKey = React.useRef(newKey());

  const options: AudienceOption[] = draft?.options ?? [];
  const audience: InviteAudience = options.find((option) => option.key === audienceKey)?.audience ?? { type: 'all' };

  function reset() {
    setStage('ask');
    setDraft(null);
    setMessage('');
    setEstimate(null);
    setEditing(false);
    setError(null);
    setSent(null);
    idempotencyKey.current = newKey();
  }

  function fail(code: string) {
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic'));
  }

  function apply(next: GuestMessageDraft) {
    setDraft(next);
    setMessage(next.message);
    setKind(next.kind);
    setEstimate(next.estimate);
    const key =
      next.options.find((option) => JSON.stringify(option.audience) === JSON.stringify(next.audience))?.key ?? 'all';
    setAudienceKey(key);
  }

  async function onDraft() {
    setError(null);
    setStage('drafting');
    const result = await draftAiMessageAction({ eventId, prompt, language });
    if (!result.ok) {
      setStage('ask');
      fail(result.code);
      return;
    }
    apply(result.data);
    setStage('review');
  }

  async function onRewrite(style: MessageStyle) {
    setError(null);
    setRewriting(style);
    const result = await draftAiMessageAction({ eventId, prompt, language, previous: message, style });
    setRewriting(null);
    if (!result.ok) return fail(result.code);
    // Keep the host's chosen audience and type; only the wording changes.
    setMessage(result.data.message);
    setEditing(false);
  }

  async function recount(nextAudience: InviteAudience, nextKind: Kind) {
    const result = await estimateAiMessageAction({ eventId, audience: nextAudience, kind: nextKind, message });
    if (result.ok) setEstimate(result.data);
  }

  async function onSend() {
    setError(null);
    setStage('sending');
    const result = await sendAiMessageAction({
      eventId,
      audience,
      kind,
      message,
      idempotencyKey: idempotencyKey.current,
    });
    if (!result.ok) {
      setStage('review');
      fail(result.code);
      return;
    }
    setSent({ queued: result.data.queued });
    setStage('sent');
    router.refresh();
  }

  const sampleName = estimate?.sample?.firstName ?? t('sampleName');
  const total = estimate?.total ?? 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      trigger={
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex h-11 items-center gap-2 rounded-full border border-white/40 bg-white/15 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] backdrop-blur transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          <Sparkles className="size-4 transition group-hover:rotate-12" aria-hidden />
          {t('trigger')}
        </button>
      }
      title={t('title')}
      description={t('subtitle')}
      className="md:max-w-xl"
    >
      <div className="flex flex-col gap-4">
        {error && <Banner tone="danger">{error}</Banner>}

        {(stage === 'ask' || stage === 'drafting') && (
          <>
            <div className="border-border/70 bg-surface focus-within:border-brand/60 focus-within:ring-brand/15 relative rounded-3xl border p-1 shadow-[var(--shadow-1)] transition focus-within:ring-4">
              <Textarea
                aria-label={t('promptLabel')}
                rows={4}
                autoFocus
                value={prompt}
                maxLength={1000}
                disabled={stage === 'drafting'}
                placeholder={t('promptPlaceholder')}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim().length >= 3) void onDraft();
                }}
                className="resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0 focus-visible:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2">
                <div role="radiogroup" aria-label={t('languageLabel')} className="bg-surface-2 flex rounded-full p-0.5">
                  {(['en', 'pcm'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={language === value}
                      onClick={() => setLanguage(value)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-semibold transition',
                        language === value ? 'bg-bg text-text shadow-[var(--shadow-1)]' : 'text-muted hover:text-text',
                      )}
                    >
                      {t(`language.${value}`)}
                    </button>
                  ))}
                </div>
                <Button
                  disabled={prompt.trim().length < 3 || stage === 'drafting'}
                  loading={stage === 'drafting'}
                  onClick={() => void onDraft()}
                  className="rounded-full"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {stage === 'drafting' ? t('drafting') : t('draft')}
                </Button>
              </div>
            </div>

            {stage === 'drafting' ? (
              <div aria-live="polite" className="flex flex-col gap-2">
                <div className="bg-surface-2 h-4 w-2/3 animate-pulse rounded-full" />
                <div className="bg-surface-2 h-4 w-full animate-pulse rounded-full" />
                <div className="bg-surface-2 h-4 w-5/6 animate-pulse rounded-full" />
                <p className="text-muted text-xs">{t('draftingHint')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-muted text-xs font-semibold tracking-wide uppercase">{t('tryOne')}</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPrompt(t(`examples.${key}`))}
                      className="border-border/70 hover:border-brand/50 hover:bg-brand/5 rounded-full border px-3 py-1.5 text-left text-xs transition"
                    >
                      {t(`examples.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Privacy />
          </>
        )}

        {(stage === 'review' || stage === 'sending') && draft && (
          <>
            <div className="flex items-center gap-2">
              <span className="bg-brand/10 text-brand-strong grid size-8 place-items-center rounded-full">
                <Sparkles className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{draft.headline || t('readyTitle')}</p>
                <p className="text-muted text-xs">{t('readyBody')}</p>
              </div>
            </div>

            <section aria-label={t('previewLabel')} className="rounded-3xl bg-[#e7ddd3] p-3 dark:bg-[#0b141a]">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    aria-label={t('editLabel')}
                    rows={6}
                    value={message}
                    maxLength={2000}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <p className="text-muted text-xs">{t('placeholdersHint')}</p>
                </div>
              ) : (
                <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm leading-relaxed text-black shadow-sm dark:bg-[#005c4b] dark:text-white">
                  <Rendered message={message} name={sampleName} link={`${appUrl.replace(/^https?:\/\//, '')}/i/…`} />
                  <p className="mt-1 text-right text-[10px] opacity-60">{t('previewFor', { name: sampleName })}</p>
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="rounded-full" onClick={() => setEditing(!editing)}>
                {editing ? <Check className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
                {editing ? t('doneEditing') : t('edit')}
              </Button>
              {STYLES.map((style) => (
                <Button
                  key={style}
                  variant="ghost"
                  size="sm"
                  className="border-border/70 rounded-full border"
                  disabled={rewriting !== null || stage === 'sending'}
                  loading={rewriting === style}
                  onClick={() => void onRewrite(style)}
                >
                  {rewriting !== style && <RefreshCw className="size-3.5" aria-hidden />}
                  {t(`styles.${style}`)}
                </Button>
              ))}
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">{t('whoLabel')}</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={audienceKey === option.key}
                    onClick={() => {
                      setAudienceKey(option.key);
                      void recount(option.audience, kind);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                      audienceKey === option.key
                        ? 'border-brand bg-brand text-on-brand shadow-[var(--shadow-1)]'
                        : 'border-border/70 hover:border-brand/50',
                    )}
                  >
                    {option.label ?? t(`audience.${option.key}`)}
                    <span className={cn('tabular-nums', audienceKey === option.key ? 'opacity-80' : 'text-muted')}>
                      {option.total}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">{t('kindLabel')}</legend>
              <div role="radiogroup" className="bg-surface-2 grid grid-cols-3 rounded-2xl p-1">
                {KINDS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={kind === value}
                    onClick={() => {
                      setKind(value);
                      void recount(audience, value);
                    }}
                    className={cn(
                      'rounded-xl px-2 py-1.5 text-xs font-semibold transition',
                      kind === value ? 'bg-bg text-text shadow-[var(--shadow-1)]' : 'text-muted hover:text-text',
                    )}
                  >
                    {t(`kinds.${value}`)}
                  </button>
                ))}
              </div>
            </fieldset>

            {estimate && (
              <div className="border-border/70 grid grid-cols-3 gap-2 rounded-2xl border p-3 text-center text-xs">
                <Channel
                  icon={<MessageCircle className="size-4" aria-hidden />}
                  label="WhatsApp"
                  n={estimate.counts.WHATSAPP}
                />
                <Channel icon={<Mail className="size-4" aria-hidden />} label={t('email')} n={estimate.counts.EMAIL} />
                <Channel icon={<Smartphone className="size-4" aria-hidden />} label="SMS" n={estimate.counts.SMS} />
                {(estimate.unreachable > 0 || estimate.smsEstimateMinor > 0) && (
                  <p className="text-muted col-span-3 text-left">
                    {estimate.unreachable > 0 && t('unreachable', { count: estimate.unreachable })}{' '}
                    {estimate.smsEstimateMinor > 0 && (
                      <>
                        {t('smsCost')} <MoneyText value={String(estimate.smsEstimateMinor)} currency={currency} />
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button variant="ghost" onClick={() => setStage('ask')} disabled={stage === 'sending'}>
                <ArrowLeft className="size-4" aria-hidden />
                {t('back')}
              </Button>
              <Button
                size="lg"
                className="rounded-full"
                disabled={total === 0 || message.trim().length === 0 || editing}
                loading={stage === 'sending'}
                onClick={() => void onSend()}
              >
                {stage !== 'sending' && <Send className="size-4" aria-hidden />}
                {total === 0 ? t('nobody') : t('send', { count: total })}
              </Button>
            </div>
            <Privacy compact />
          </>
        )}

        {stage === 'sent' && sent && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" aria-live="polite">
            <span className="bg-success/15 text-success grid size-14 place-items-center rounded-full">
              <Check className="size-7" aria-hidden />
            </span>
            <p className="font-display text-xl font-bold">{t('sentTitle', { count: sent.queued })}</p>
            <p className="text-muted max-w-sm text-sm">{t('sentBody')}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={reset}>
                <Sparkles className="size-4" aria-hidden />
                {t('another')}
              </Button>
              <Button onClick={() => setOpen(false)}>{t('done')}</Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function Rendered({ message, name, link }: { message: string; name: string; link: string }) {
  const parts = message.split(/(\{name\}|\{link\})/g);
  return (
    <p className="break-words whitespace-pre-wrap">
      {parts.map((part, i) =>
        part === '{name}' ? (
          <strong key={i}>{name}</strong>
        ) : part === '{link}' ? (
          <span key={i} className="text-[#027eb5] underline dark:text-[#53bdeb]">
            {link}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

function Channel({ icon, label, n }: { icon: React.ReactNode; label: string; n: number }) {
  return (
    <div className={cn('flex flex-col items-center gap-1', n === 0 && 'opacity-40')}>
      <span className="text-brand-strong">{icon}</span>
      <span className="text-base font-semibold tabular-nums">{n}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}

function Privacy({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('events.invites.ai');
  return (
    <div className="bg-surface-2 flex items-start gap-2.5 rounded-2xl px-3 py-2.5 text-xs">
      <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <p>
          <span className="font-semibold">{t('ruleSendTitle')}</span> {t('ruleSendBody')}
        </p>
        {!compact && (
          <p>
            <span className="font-semibold">{t('rulePrivacyTitle')}</span> {t('rulePrivacyBody')}
          </p>
        )}
        {compact && (
          <p className="text-muted flex items-center gap-1">
            <Users className="size-3" aria-hidden />
            {t('rulePrivacyShort')}
          </p>
        )}
      </div>
    </div>
  );
}
