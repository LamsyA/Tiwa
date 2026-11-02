import { ORDER_STAGES, listMyOrgs, myEventOrders, vendorOrders, type OrderStage } from '@tiwa/core';
import { getTranslations } from 'next-intl/server';
import { AppFrame } from '@/components/app-frame.js';
import { OrdersBoard } from '@/components/orders/orders-board.js';
import { requirePageUser } from '@/lib/ctx.js';

/** Order tracking (D-X35): vendors see their clients' orders; hosts and planners see orders across their events. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const ctx = await requirePageUser('/orders');
  const { stage: raw } = await searchParams;
  const stage = ORDER_STAGES.find((key) => key === raw) ?? 'all';
  const t = await getTranslations('orders');
  const orgs = await listMyOrgs(ctx.actor.userId);
  const vendor = orgs.some((row) => row.org.kind === 'PLANNER')
    ? undefined
    : orgs.find((row) => row.org.kind === 'VENDOR')?.org;
  const data = vendor ? await vendorOrders(ctx.actor, { orgId: vendor.id }) : await myEventOrders(ctx.actor);
  return (
    <AppFrame userId={ctx.actor.userId} active="orders" title={t('title')}>
      <OrdersBoard
        rows={data.rows}
        counts={data.counts}
        side={vendor ? 'vendor' : 'client'}
        stage={stage as OrderStage | 'all'}
        baseHref="/orders"
      />
    </AppFrame>
  );
}
