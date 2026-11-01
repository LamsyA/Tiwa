'use client';

import { useTranslations } from 'next-intl';
import { moveLeadAction } from '../actions.js';

const STAGES = ['ENQUIRY', 'PROPOSAL_SENT', 'WON', 'LOST'] as const;

export function StageButtons({ clientId, stage }: { clientId: string; stage: string }) {
  const t = useTranslations('planner');
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('pipeline')}>
      {STAGES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={s === stage}
          onClick={() => moveLeadAction({ clientId, stage: s })}
          className="border-border rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {t(`stages.${s}`)}
        </button>
      ))}
    </div>
  );
}
