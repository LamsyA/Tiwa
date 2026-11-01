import { budgetCsv, budgetSummary, isDomainError } from '@tiwa/core';
import { prisma } from '@tiwa/db';
import { NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getCtx } from '@/lib/ctx.js';

export const dynamic = 'force-dynamic';

/** Budget CSV (P9-T06, UF-20 step 4): money.view only, generated straight from the summary (no worker). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  if (!ctx.actor) return NextResponse.json({ ok: false, error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  try {
    const summary = await budgetSummary(ctx.actor, { eventId: id });
    const t = await getTranslations('events.money');
    const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    const csv = budgetCsv(summary, summary.currency, {
      headers: [
        t('csv.section'),
        t('csv.item'),
        t('planned'),
        t('committed'),
        t('paid'),
        t('outstanding'),
        t('csv.currency'),
      ],
      sections: {
        line: t('category'),
        booking: t('csv.booking'),
        expense: t('csv.expense'),
        income: t('tabs.income'),
      },
      otherLabel: t('otherLine'),
      incomeKind: (kind) => (t.has(`kinds.${kind}`) ? t(`kinds.${kind}`) : kind),
    });
    return new NextResponse(`\uFEFF${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="budget-${event.slug}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return NextResponse.json({ ok: false, error: { code: error.code } }, { status: error.status });
  }
}
