'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { ReviewReportButton } from '@/components/marketplace/review-report.js';
import {
  approvePortfolioAction,
  closeEventAction,
  confirmDeliveryAction,
  createReviewAction,
  declinePortfolioAction,
} from './actions.js';

export interface CloseBooking {
  bookingId: string;
  vendorOrgId: string;
  vendorName: string;
  category: string;
  status: string;
  totalMinor: string;
  currency: string;
  review: {
    id: string;
    overall: number;
    quality: number;
    communication: number;
    punctuality: number;
    value: number;
    scope: number;
    body: string | null;
    photoIds: string[];
    reply: string | null;
  } | null;
}

export interface ClosePhoto {
  id: string;
  thumbUrl: string | null;
}

const SCORE_KEYS = ['quality', 'communication', 'punctuality', 'value', 'scope'] as const;

/** Close flow (P14-T02, UF-25): confirm deliveries, reconcile, review each
 * vendor, then finish. Review forms unlock only on COMPLETED bookings. */
export interface PendingPortfolioItem {
  id: string;
  orgId: string;
  orgName: string;
  caption: string | null;
  thumbUrl: string | null;
}

export function CloseManager(props: {
  eventId: string;
  eventStatus: string;
  bookings: CloseBooking[];
  photos: ClosePhoto[];
  pendingPortfolio: PendingPortfolioItem[];
}) {
  const t = useTranslations('close');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean }>) => {
    setError(null);
    start(async () => {
      if (!(await fn()).ok) setError('saveFailed');
    });
  };

  const blocked = props.bookings.filter((row) => !['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(row.status));

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-danger text-sm">{error}</p>}
      {props.eventStatus === 'COMPLETED' && (
        <Card className="p-4">
          <p className="text-sm">{t('closed')}</p>
        </Card>
      )}

      <section className="flex flex-col gap-2" aria-label={t('deliveriesHeading')}>
        <h2 className="font-display text-lg font-bold">{t('deliveriesHeading')}</h2>
        {props.bookings.length === 0 && <p className="text-muted text-sm">{t('noBookings')}</p>}
        <ul className="flex flex-col gap-2">
          {props.bookings.map((row) => (
            <li key={row.bookingId}>
              <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="font-medium">{row.vendorName}</span>
                <span className="text-muted">{row.category}</span>
                <span className="ml-auto rounded-full border px-2 py-0.5 text-xs">{row.status}</span>
                {!['DELIVERED', 'COMPLETED'].includes(row.status) && props.eventStatus !== 'COMPLETED' && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => run(() => confirmDeliveryAction({ bookingId: row.bookingId }))}
                  >
                    {t('confirmDelivery')}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-bold">{t('reviewsHeading')}</h2>
        <ul className="flex flex-col gap-3">
          {props.bookings.map((row) => (
            <li key={row.bookingId}>
              <ReviewCard
                eventStatus={props.eventStatus}
                booking={row}
                photos={props.photos}
                pending={pending}
                run={run}
              />
            </li>
          ))}
        </ul>
      </section>

      {props.pendingPortfolio.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('portfolioHeading')}>
          <h2 className="font-display text-lg font-bold">{t('portfolioHeading')}</h2>
          <p className="text-muted text-sm">{t('portfolioBody')}</p>
          <ul className="flex flex-wrap gap-2">
            {props.pendingPortfolio.map((row) => (
              <li key={row.id} className="border-border bg-bg flex items-center gap-2 rounded-xl border p-2 text-sm">
                {row.thumbUrl ? (
                  <img
                    src={row.thumbUrl}
                    alt={t('reviewPhotoAlt')}
                    width={64}
                    height={64}
                    className="rounded-lg object-cover"
                  />
                ) : null}
                <span className="font-medium">{row.orgName}</span>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => approvePortfolioAction({ itemId: row.id }))}
                >
                  {t('approve')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => declinePortfolioAction({ itemId: row.id }))}
                >
                  {t('decline')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.eventStatus !== 'COMPLETED' && (
        <div className="flex flex-col gap-2">
          {blocked.length > 0 && (
            <p className="text-muted text-sm">
              {t('finishBlocked')} ({blocked.map((row) => row.vendorName).join(', ')})
            </p>
          )}
          <div>
            <Button
              disabled={pending || blocked.length > 0}
              onClick={() => run(() => closeEventAction({ eventId: props.eventId }))}
            >
              {t('finish')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard(props: {
  eventStatus: string;
  booking: CloseBooking;
  photos: ClosePhoto[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean }>) => void;
}) {
  const t = useTranslations('close');
  const { booking } = props;
  const [scores, setScores] = useState<Record<string, string>>({
    quality: '5',
    communication: '5',
    punctuality: '5',
    value: '5',
    scope: '5',
  });
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  if (booking.review) {
    return (
      <Card className="flex flex-col gap-2 p-4 text-sm">
        <p className="font-medium">
          {booking.vendorName} · {booking.review.overall.toFixed(1)} / 5 — {t('reviewed')}
        </p>
        {booking.review.body && <p className="text-muted">{booking.review.body}</p>}
        {booking.review.reply && (
          <p>
            <span className="font-medium">{t('replyHeading')}: </span>
            {booking.review.reply}
          </p>
        )}
        {booking.review.reply && <ReviewReportButton reviewId={booking.review.id} />}
      </Card>
    );
  }
  if (booking.status !== 'COMPLETED' || props.eventStatus === 'COMPLETED') {
    return (
      <Card className="p-4 text-sm">
        <p className="font-medium">{booking.vendorName}</p>
        <p className="text-muted">{t('reviewsLocked')}</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-4 text-sm">
      <p className="font-medium">{t('reviewHeading', { vendor: booking.vendorName })}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SCORE_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-muted text-xs">{t(key)}</span>
            <select
              aria-label={t(key)}
              value={scores[key]}
              onChange={(event) => setScores((prev) => ({ ...prev, [key]: event.target.value }))}
              className="border-border bg-bg rounded-xl border px-3 py-2"
            >
              {['1', '2', '3', '4', '5'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <Input
        aria-label={t('reviewBody')}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={t('reviewBody')}
      />
      {props.photos.length > 0 && (
        <fieldset>
          <legend className="text-muted text-xs">{t('reviewPhotos')}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {props.photos.map((photo) => (
              <label key={photo.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={picked.includes(photo.id)}
                  onChange={(event) =>
                    setPicked((prev) =>
                      event.target.checked ? [...prev, photo.id] : prev.filter((id) => id !== photo.id),
                    )
                  }
                />
                {photo.thumbUrl ? (
                  <img
                    src={photo.thumbUrl}
                    alt={t('reviewPhotoAlt')}
                    width={64}
                    height={64}
                    className="rounded-lg object-cover"
                  />
                ) : (
                  <span className="text-muted text-xs">{photo.id.slice(0, 8)}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <Button
          disabled={props.pending}
          onClick={() =>
            props.run(() =>
              createReviewAction({
                bookingId: booking.bookingId,
                quality: Number(scores.quality),
                communication: Number(scores.communication),
                punctuality: Number(scores.punctuality),
                value: Number(scores.value),
                scope: Number(scores.scope),
                body: body.trim() || undefined,
                photoIds: picked.length > 0 ? picked : undefined,
              }),
            )
          }
        >
          {t('submitReview')}
        </Button>
      </div>
    </Card>
  );
}
