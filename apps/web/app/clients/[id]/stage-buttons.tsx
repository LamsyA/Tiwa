'use client';

import { useTranslations } from 'next-intl';
import { moveLeadAction } from '../actions.js';

const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;

export function StageButtons({ clientId, stage }: { clientId: string; stage: string }) {
  const t = useTranslations('planner');
  return (
    <div className="bg-surface-2 inline-flex flex-wrap gap-1 rounded-full p-1" role="group" aria-label={t('pipeline')}>
      {STAGES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === stage}
          disabled={s === stage}
          onClick={() => moveLeadAction({ clientId, stage: s })}
          className="rounded-full px-3.5 py-1.5 text-sm font-medium transition hover:text-[var(--text)] disabled:cursor-default aria-pressed:bg-[var(--surface)] aria-pressed:text-[var(--text)] aria-pressed:shadow-[var(--shadow-1)] text-muted"
        >
          {t(`stages.${s}`)}
        </button>
      ))}
    </div>
  );
}
