'use client';

import { Banner, Button, ConfirmDialog } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  blockMomentUploader,
  bulkModerateMoments,
  moderateMoment,
  morePendingMoments,
  morePublishedMoments,
  resolveMomentReport,
} from './actions.js';

export interface QueueItem {
  id: string;
  album: 'OFFICIAL' | 'GUEST';
  kind: 'PHOTO' | 'VIDEO';
  thumbUrl: string | null;
  largeUrl: string | null;
  createdAt: string;
  uploaderLabel: string;
  featured: boolean;
}

export interface QueueReport {
  id: string;
  reason: string;
  createdAt: string;
  reporterLabel: string;
  // Reported items render thumbnail + state + actions only; the pending
  // QueueItem extras (createdAt/uploader/featured) are not needed here.
  item: {
    id: string;
    kind: 'PHOTO' | 'VIDEO';
    state: string;
    thumbUrl: string | null;
    largeUrl: string | null;
  } | null;
}

type ItemAction = 'approve' | 'hide' | 'unhide' | 'feature' | 'unfeature' | 'delete';

function ageLabel(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

async function runAction(
  eventId: string,
  mediaId: string,
  action: ItemAction,
): Promise<{ ok: boolean; code?: string }> {
  const result = await moderateMoment({ eventId, mediaId, action });
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}

/**
 * Host review queue (P5-T08, UF-11): oldest-first pending grid with
 * approve/hide/keys/swipe/bulk, plus the reported-photos list. Every action
 * publishes to `gallery:{id}` so the live gallery updates within seconds.
 */
export function ModerationQueue({
  eventId,
  initialPending,
  initialCursor,
  initialPublished,
  initialPublishedCursor,
  initialReports,
}: {
  eventId: string;
  initialPending: QueueItem[];
  initialCursor: string | null;
  initialPublished: QueueItem[];
  initialPublishedCursor: string | null;
  initialReports: QueueReport[];
}) {
  const t = useTranslations('events.momentsPage');
  const te = useTranslations('events.momentsPage.errors');
  const router = useRouter();
  const [tab, setTab] = React.useState<'pending' | 'published' | 'reported'>('pending');
  const [pending, setPending] = React.useState(initialPending);
  const [cursor, setCursor] = React.useState<string | null>(initialCursor);
  const [published, setPublished] = React.useState(initialPublished);
  const [publishedCursor, setPublishedCursor] = React.useState<string | null>(initialPublishedCursor);
  const [reports, setReports] = React.useState(initialReports);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [selecting, setSelecting] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | undefined>();

  function fail(code?: string) {
    try {
      setError(te(code ?? 'generic'));
    } catch {
      setError(te('generic'));
    }
  }

  async function act(id: string, action: ItemAction) {
    setBusyId(id);
    setError(undefined);
    const result = await runAction(eventId, id, action);
    setBusyId(null);
    if (!result.ok) {
      fail(result.code);
      return;
    }
    const inPublished = published.some((item) => item.id === id);
    const setList = inPublished ? setPublished : setPending;
    if (action === 'feature' || action === 'unfeature' || action === 'unhide') {
      setList((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, featured: action === 'feature' ? true : action === 'unfeature' ? false : item.featured }
            : item,
        ),
      );
    } else {
      setList((prev) => prev.filter((item) => item.id !== id));
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    router.refresh();
  }

  async function bulk(action: 'approve' | 'hide' | 'delete') {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusyId('bulk');
    const result = await bulkModerateMoments({ eventId, mediaIds: ids, action });
    setBusyId(null);
    if (!result.ok) {
      try {
        fail(result.code);
      } catch {
        fail();
      }
      return;
    }
    setPending((prev) => prev.filter((item) => !selected.has(item.id)));
    setPublished((prev) => prev.filter((item) => !selected.has(item.id)));
    setSelected(new Set());
    setSelecting(false);
    router.refresh();
  }

  async function loadMore() {
    if (busyId) return;
    if (tab === 'published') {
      if (!publishedCursor) return;
      setBusyId('more');
      const result = await morePublishedMoments({ eventId, cursor: publishedCursor });
      setBusyId(null);
      if (!result.ok) {
        fail(result.code);
        return;
      }
      setPublished((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...(result.data.items.filter((item) => !seen.has(item.id)) as QueueItem[])];
      });
      setPublishedCursor(result.data.nextCursor);
      return;
    }
    if (!cursor) return;
    setBusyId('more');
    const result = await morePendingMoments({ eventId, cursor });
    setBusyId(null);
    if (!result.ok) {
      fail(result.code);
      return;
    }
    setPending((prev) => {
      const seen = new Set(prev.map((item) => item.id));
      return [...prev, ...result.data.items.filter((item) => !seen.has(item.id))];
    });
    setCursor(result.data.nextCursor);
  }

  async function block(id: string) {
    setBusyId(id);
    const result = await blockMomentUploader({ eventId, mediaId: id });
    setBusyId(null);
    if (!result.ok) {
      fail(result.code);
      return;
    }
    setPending((prev) => prev.filter((item) => item.id !== id));
    setPublished((prev) => prev.filter((item) => item.id !== id));
    setReports((prev) => prev.filter((report) => report.item?.id !== id));
    router.refresh();
  }

  async function dismissReport(reportId: string) {
    setBusyId(reportId);
    const result = await resolveMomentReport({ eventId, reportId });
    setBusyId(null);
    if (!result.ok) {
      fail(result.code);
      return;
    }
    setReports((prev) => prev.filter((report) => report.id !== reportId));
  }

  const gridItems = tab === 'published' ? published : pending;
  const gridCursor = tab === 'published' ? publishedCursor : cursor;
  const gridPending = tab !== 'published';

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('pending')}
          aria-pressed={tab === 'pending'}
          className={
            tab === 'pending'
              ? 'rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold'
              : 'rounded-full px-4 py-2 text-sm text-muted'
          }
        >
          {t('queueTitle')} · {pending.length}
          {cursor ? '+' : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('published')}
          aria-pressed={tab === 'published'}
          className={
            tab === 'published'
              ? 'rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold'
              : 'rounded-full px-4 py-2 text-sm text-muted'
          }
        >
          {t('publishedTab')} · {published.length}
          {publishedCursor ? '+' : ''}
        </button>
        <button
          type="button"
          onClick={() => setTab('reported')}
          aria-pressed={tab === 'reported'}
          className={
            tab === 'reported'
              ? 'rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold'
              : 'rounded-full px-4 py-2 text-sm text-muted'
          }
        >
          {t('reportedTitle')} · {reports.length}
        </button>
        <div className="flex-1" />
        {tab !== 'reported' && (tab === 'pending' ? pending.length > 0 : published.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSelecting((value) => !value);
              setSelected(new Set());
            }}
            className="text-sm font-medium underline"
          >
            {t('select')}
          </button>
        )}
      </div>
      {error && (
        <div className="mb-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      {selecting && selected.size > 0 && (
        <div className="border-border bg-surface sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-xl border p-2">
          <span className="text-sm font-medium">{t('bulkSelected', { count: selected.size })}</span>
          <div className="flex-1" />
          <Button size="sm" disabled={busyId !== null} onClick={() => void bulk('approve')}>
            {t('bulkApprove')}
          </Button>
          <Button size="sm" variant="secondary" disabled={busyId !== null} onClick={() => void bulk('hide')}>
            {t('bulkHide')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t('cancel')}
          </Button>
        </div>
      )}
      {tab === 'reported' && reports.length === 0 && (
        <p className="text-muted py-8 text-center text-sm">{t('reportedEmpty')}</p>
      )}
      {tab === 'reported' && reports.length > 0 && (
        <ul className="flex flex-col gap-2">
          {reports.map((report) => (
            <li key={report.id} className="border-border flex gap-3 rounded-xl border p-2">
              {report.item?.thumbUrl ? (
                <img
                  src={report.item.thumbUrl}
                  alt={t('photoAlt')}
                  loading="lazy"
                  className="size-16 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="bg-surface-2 size-16 shrink-0 rounded" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{t('reportedReason', { reason: report.reason })}</p>
                <p className="text-muted text-xs">{t('reportedBy', { name: report.reporterLabel })}</p>
                {report.item && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {report.item.state === 'PENDING_REVIEW' && (
                      <Button
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => void act(report.item?.id ?? '', 'approve')}
                      >
                        {t('approve')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId !== null}
                      onClick={() => void act(report.item?.id ?? '', 'hide')}
                    >
                      {t('hide')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId !== null}
                      onClick={() => void block(report.item?.id ?? '')}
                    >
                      {t('blockUploader')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId !== null}
                      onClick={() => void dismissReport(report.id)}
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {tab !== 'reported' && (
        <>
          {tab === 'pending' && <p className="text-muted mb-2 text-xs">{t('queueBody')}</p>}
          {gridItems.length === 0 ? (
            <p className="text-muted py-8 text-center text-sm">{t('queueEmpty')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {gridItems.map((item) => (
                <PendingTile
                  key={item.id}
                  item={item}
                  pending={gridPending}
                  selecting={selecting}
                  checked={selected.has(item.id)}
                  busy={busyId === item.id}
                  onToggle={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  onAct={(action) => void act(item.id, action)}
                  onBlock={() => void block(item.id)}
                />
              ))}
            </div>
          )}
          {gridCursor && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={busyId !== null}
              className="mt-3 w-full rounded-xl border border-border py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {busyId === 'more' ? t('loading') : t('showMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PendingTile({
  item,
  selecting,
  checked,
  busy,
  onToggle,
  onAct,
  onBlock,
  pending,
}: {
  item: QueueItem;
  selecting: boolean;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
  onAct: (action: ItemAction) => void;
  onBlock: () => void;
  /** Pending rows can be approved; published rows can only be hidden/deleted/blocked. */
  pending: boolean;
}) {
  const t = useTranslations('events.momentsPage');
  const touch = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="border-border overflow-hidden rounded-xl border"
      tabIndex={0}
      role="group"
      data-media-id={item.id}
      data-published-tile={pending ? undefined : 'true'}
      aria-label={`${t('byUploader', { name: item.uploaderLabel })}`}
      onKeyDown={(event) => {
        if (pending && event.key === 'a') onAct('approve');
        else if (event.key === 'h') onAct('hide');
      }}
      onTouchStart={(event) => {
        const touchPoint = event.touches[0];
        if (touchPoint) touch.current = { x: touchPoint.clientX, y: touchPoint.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        const end = event.changedTouches[0];
        touch.current = null;
        if (!start || !end) return;
        const dx = end.clientX - start.x;
        const dy = end.clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dy) < 40) onAct(dx > 0 && pending ? 'approve' : 'hide');
      }}
    >
      <div className="relative aspect-square bg-surface-2">
        {selecting && (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            aria-label={t('select')}
            className="absolute left-2 top-2 z-10 size-5"
          />
        )}
        {item.thumbUrl ? (
          <img src={item.thumbUrl} alt={t('photoAlt')} loading="lazy" className="size-full object-cover" />
        ) : (
          <div className="text-muted flex size-full items-center justify-center text-xs">{t('processing')}</div>
        )}
        {item.featured && (
          <span aria-hidden className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[11px] text-white">
            ★
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2">
        <p className="text-muted truncate text-xs">
          {item.album === 'OFFICIAL' ? t('albumOfficial') : t('albumGuest')} ·{' '}
          {t('byUploader', { name: item.uploaderLabel })} · {ageLabel(item.createdAt)}
        </p>
        <div className="flex flex-wrap gap-1">
          {pending && (
            <Button size="sm" disabled={busy} onClick={() => onAct('approve')}>
              {t('approve')}
            </Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct('hide')}>
            {t('hide')}
          </Button>
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="ghost" disabled={busy}>
                {t('blockUploader')}
              </Button>
            }
            title={t('blockUploader')}
            body={t('blockConfirm')}
            confirmLabel={t('blockUploader')}
            destructive
            onConfirm={() => onBlock()}
          />
        </div>
      </div>
    </div>
  );
}
