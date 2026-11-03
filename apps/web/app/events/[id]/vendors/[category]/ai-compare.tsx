'use client';

import { Banner, Button, cn } from '@tiwa/ui';
import { CircleAlert, CircleCheck, CircleHelp, MessageCircleQuestion, Receipt, RefreshCw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { AiNote, AiThinking, AiTrigger, aiErrorKey } from '@/components/ai/ai-ui.js';
import { aiCompareQuotesAction } from '../actions.js';

interface Comparison {
  moneyVisible: boolean;
  summary: string;
  questions: string[];
  quotes: {
    ref: string;
    quoteId: string;
    vendor: string;
    strengths: string[];
    missing: string[];
    unclear: string[];
    extraFees: string[];
  }[];
}

const SECTIONS = [
  { key: 'strengths', icon: CircleCheck, tone: 'text-success' },
  { key: 'missing', icon: CircleAlert, tone: 'text-danger' },
  { key: 'unclear', icon: CircleHelp, tone: 'text-warning' },
  { key: 'extraFees', icon: Receipt, tone: 'text-brand-strong' },
] as const;

/**
 * "Compare with AI" (AI-02, P15-T04): what each quote includes, leaves out,
 * says vaguely, and charges on top, plus questions to ask. Read-only: it
 * never accepts, declines or changes a quote.
 */
export function AiCompare({
  eventId,
  category,
  categoryLabel,
}: {
  eventId: string;
  category: string;
  categoryLabel: string;
}) {
  const t = useTranslations('ai.compare');
  const te = useTranslations('ai.errors');
  const [result, setResult] = React.useState<Comparison | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    const response = await aiCompareQuotesAction({ eventId, category, categoryLabel });
    setBusy(false);
    if (!response.ok) {
      const key = aiErrorKey(response);
      setError(te.has(key) ? te(key as 'generic') : te('generic'));
      return;
    }
    setResult(response.data);
  }

  if (!result && !busy) {
    return (
      <div className="flex flex-col gap-2">
        {error && <Banner tone="danger">{error}</Banner>}
        <AiTrigger className="self-start" onClick={() => void run()}>
          {t('trigger')}
        </AiTrigger>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="ai-compare"
      className="border-border/70 bg-surface relative flex flex-col gap-4 overflow-hidden rounded-3xl border p-4 shadow-[var(--shadow-1)] sm:p-5"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--brand),var(--accent),var(--brand))]"
      />
      <div className="flex items-start gap-2">
        <h3 id="ai-compare" className="font-display flex-1 text-lg font-semibold">
          {t('title')}
        </h3>
        {result && (
          <>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run()} aria-label={t('again')}>
              <RefreshCw className="size-4" aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)} aria-label={t('close')}>
              <X className="size-4" aria-hidden />
            </Button>
          </>
        )}
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {busy ? (
        <AiThinking label={t('thinking')} />
      ) : (
        result && (
          <>
            <p className="text-sm leading-relaxed">{result.summary}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {result.quotes.map((quote) => (
                <article key={quote.quoteId} className="border-border/70 flex flex-col gap-3 rounded-2xl border p-4">
                  <header className="flex items-center gap-2">
                    <span className="bg-brand/10 text-brand-strong grid size-7 place-items-center rounded-full text-xs font-bold">
                      {quote.ref}
                    </span>
                    <p className="min-w-0 flex-1 truncate font-semibold">{quote.vendor}</p>
                  </header>
                  {SECTIONS.map(({ key, icon: Icon, tone }) =>
                    quote[key].length > 0 ? (
                      <div key={key} className="flex flex-col gap-1">
                        <p className={cn('flex items-center gap-1.5 text-xs font-semibold', tone)}>
                          <Icon className="size-3.5" aria-hidden />
                          {t(`sections.${key}`)}
                        </p>
                        <ul className="text-muted flex list-disc flex-col gap-0.5 pl-5 text-sm">
                          {quote[key].map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </article>
              ))}
            </div>
            {result.questions.length > 0 && (
              <div className="bg-surface-2 flex flex-col gap-1.5 rounded-2xl p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircleQuestion className="size-4" aria-hidden />
                  {t('questions')}
                </p>
                <ul className="text-muted flex list-disc flex-col gap-0.5 pl-5 text-sm">
                  {result.questions.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <AiNote>
              <p>{result.moneyVisible ? t('note') : t('noteNoMoney')}</p>
            </AiNote>
          </>
        )
      )}
    </section>
  );
}
