'use client';

import { DropdownMenu, cn } from '@tiwa/ui';
import { Check, CheckCheck, Clock, FileText, MoreVertical, Pin } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type BubbleStatus = 'pending' | 'sent' | 'delivered' | 'seen';

export interface BubbleMessage {
  id: string;
  body: string | null;
  mine: boolean;
  authorName: string | null;
  deleted: boolean;
  edited: boolean;
  masked: boolean;
  isDecision: boolean;
  createdAt: string;
  attachments?: { name: string; mime: string; sizeBytes: number }[];
}

function time(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** One message: my messages right-aligned with clock/tick receipts (§9a.2), others left with the author's name. */
export function MessageBubble({
  message,
  status,
  showAuthor,
  canEdit,
  canDecide,
  onEdit,
  onDelete,
  onDecision,
  onReport,
  /** Pending (not yet stored) messages show names only; stored ones link to the participant-checked route. */
  attachmentHref,
}: {
  message: BubbleMessage;
  attachmentHref?: (index: number, download?: boolean) => string;
  status?: BubbleStatus;
  showAuthor: boolean;
  canEdit: boolean;
  canDecide: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onDecision?: () => void;
  onReport?: () => void;
}) {
  const t = useTranslations('inbox');
  const items = [
    ...(canEdit && onEdit ? [{ label: t('edit'), onSelect: onEdit }] : []),
    ...(canEdit && onDelete ? [{ label: t('delete'), onSelect: onDelete }] : []),
    ...(canDecide && onDecision && !message.deleted ? [{ label: t('markDecision'), onSelect: onDecision }] : []),
    ...(onReport ? [{ label: t('report'), onSelect: onReport }] : []),
  ];
  const tick =
    status === 'pending' ? (
      <Clock aria-label={t('sending')} className="size-3.5" />
    ) : status === 'seen' ? (
      <CheckCheck aria-label={t('seen')} className="size-4 text-[var(--chat-seen)]" />
    ) : status === 'delivered' ? (
      <CheckCheck aria-label={t('delivered')} className="size-4" />
    ) : status === 'sent' ? (
      <Check aria-label={t('sent')} className="size-4" />
    ) : null;

  return (
    <div className={cn('group flex items-end gap-1', message.mine ? 'justify-end' : 'justify-start')}>
      {message.mine && items.length > 0 && (
        <DropdownMenu
          trigger={
            <button
              type="button"
              aria-label={t('messageMenu')}
              className="text-muted hover:text-text focus-visible:outline-focus flex size-9 items-center justify-center rounded-full opacity-100 focus-visible:outline-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <MoreVertical aria-hidden className="size-4" />
            </button>
          }
          items={items}
        />
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-lg px-2.5 pt-1.5 pb-1 text-[14.5px] leading-[1.35] sm:max-w-[65%]',
          message.mine ? 'tiwa-bubble-out' : 'tiwa-bubble-in',
          showAuthor && 'tiwa-tail',
          showAuthor && (message.mine ? 'rounded-tr-none' : 'rounded-tl-none'),
          message.isDecision && 'ring-accent ring-2',
        )}
      >
        {showAuthor && !message.mine && message.authorName && (
          <p className="text-brand-strong mb-0.5 text-[13px] font-semibold">{message.authorName}</p>
        )}
        {message.isDecision && (
          <p className="mb-0.5 flex items-center gap-1 text-xs font-semibold">
            <Pin aria-hidden className="size-3" /> {t('decision')}
          </p>
        )}
        {!message.deleted && message.attachments && message.attachments.length > 0 && (
          <ul className="mb-1 flex flex-col gap-1">
            {message.attachments.map((file, index) =>
              file.mime.startsWith('image/') && attachmentHref ? (
                <li key={index}>
                  <a
                    href={attachmentHref(index)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('openFile', { name: file.name })}
                  >
                    <img
                      src={attachmentHref(index)}
                      alt={file.name}
                      loading="lazy"
                      className="max-h-64 w-full rounded-lg object-cover"
                    />
                  </a>
                </li>
              ) : (
                <li key={index}>
                  {attachmentHref ? (
                    <a
                      href={attachmentHref(index, true)}
                      className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5 underline-offset-2 hover:underline"
                    >
                      <FileText aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </a>
                  ) : (
                    <span className="flex items-center gap-2 rounded-lg bg-black/10 px-2 py-1.5">
                      <FileText aria-hidden className="size-4 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
        {message.deleted ? (
          <p className="italic opacity-80">{t('deleted')}</p>
        ) : (
          message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        {message.masked && !message.deleted && <p className="mt-0.5 text-xs opacity-75">{t('maskedHint')}</p>}
        <p className="-mb-0.5 ml-3 flex items-center justify-end gap-1 text-[11px] leading-4 text-[var(--chat-meta)]">
          {message.edited && !message.deleted && <span>{t('edited')}</span>}
          <time dateTime={message.createdAt}>{time(message.createdAt)}</time>
          {message.mine && tick}
        </p>
      </div>
      {!message.mine && items.length > 0 && (
        <DropdownMenu
          trigger={
            <button
              type="button"
              aria-label={t('messageMenu')}
              className="text-muted hover:text-text focus-visible:outline-focus flex size-9 items-center justify-center rounded-full opacity-100 focus-visible:outline-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <MoreVertical aria-hidden className="size-4" />
            </button>
          }
          items={items}
        />
      )}
    </div>
  );
}
