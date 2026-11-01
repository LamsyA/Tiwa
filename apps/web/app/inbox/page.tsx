import { getTranslations } from 'next-intl/server';
import { requirePageUser } from '@/lib/ctx.js';
import { InboxLayout, parseFilter } from './inbox-layout.js';

/** `/inbox`: the conversation list (desktop shows an empty thread pane). */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const { filter, q } = await searchParams;
  const ctx = await requirePageUser('/inbox');
  const t = await getTranslations('inbox');
  return (
    <InboxLayout ctx={ctx} filter={parseFilter(filter)} q={q}>
      <p className="text-muted">{t('pickThread')}</p>
    </InboxLayout>
  );
}
