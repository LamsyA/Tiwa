'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UploadQueueProvider, useUploadQueue } from '@/components/uploads/upload-queue.js';

interface SessionResponse {
  ok: boolean;
  data?: { sessionId?: string };
}

/**
 * Guest upload sheet (P5-T07, UF-10): first-upload name + consent, file
 * picker (images + video, MIXED kind), per-file progress with retry,
 * IndexedDB resume after reloads. Completion/abort is wired in the uploader:
 * success POSTs /api/uploads/complete, removal POSTs /api/uploads/abort.
 */
function Sheet({ moderation }: { moderation: 'INSTANT' | 'APPROVE_FIRST' }) {
  const t = useTranslations('gallery');
  const queue = useUploadQueue();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const done = queue.files.filter((file) => file.status === 'complete').length;
  const active = queue.files.filter((file) => file.status === 'uploading' || file.status === 'queued').length;

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length > 0) queue.addFiles(picked);
    event.target.value = '';
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        aria-label={t('choosePhotos')}
        onChange={onPick}
      />
      {queue.restoredCount > 0 && (
        <button
          type="button"
          onClick={() => queue.resume()}
          className="mb-3 w-full rounded-md border border-border py-2.5 text-sm font-medium"
        >
          {t('resumeUploads', { count: queue.restoredCount })}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (queue.files.length === 0) inputRef.current?.click();
          else queue.resume();
        }}
        className="bg-brand-strong text-on-brand w-full rounded-md py-3 text-base font-semibold"
      >
        {t('choosePhotos')}
      </button>
      {queue.totalProgress > 0 && (
        <div
          className="mt-3"
          role="progressbar"
          aria-valuenow={Math.round(queue.totalProgress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="bg-surface-2 h-2 overflow-hidden rounded-full">
            <div className="bg-brand-strong h-full rounded-full" style={{ width: `${queue.totalProgress * 100}%` }} />
          </div>
          <p className="text-muted mt-1 text-sm">{t('uploadingOf', { active, total: queue.files.length })}</p>
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {queue.files.map((file) => (
          <li key={file.id} className="border-border flex items-center gap-3 rounded-md border p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-muted text-xs">
                {file.status === 'complete'
                  ? t('done')
                  : file.status === 'error'
                    ? (file.error ?? t('failed'))
                    : `${Math.round(file.progress * 100)}%`}
              </p>
            </div>
            {file.status === 'error' && (
              <button type="button" onClick={() => queue.retryFile(file.id)} className="text-sm font-medium underline">
                {t('retry')}
              </button>
            )}
            {file.status !== 'complete' && (
              <button
                type="button"
                onClick={() => queue.removeFile(file.id)}
                aria-label={t('removePhoto', { name: file.name })}
                className="text-muted px-2 text-lg"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {done > 0 && queue.files.length === done && (
        <p className="bg-success-soft text-success mt-4 rounded-md p-3 text-sm font-medium">
          {moderation === 'APPROVE_FIRST' ? t('sentForApproval') : t('sharedThanks', { count: done })}
        </p>
      )}
      <p className="text-muted mt-4 text-xs">{t('limitNote')}</p>
    </div>
  );
}

export function UploadSheet({
  code,
  eventId,
  galleryId,
  access,
  moderation,
  sessionName,
  hasSession,
}: {
  code: string;
  eventId: string;
  galleryId: string;
  access: string;
  moderation: 'INSTANT' | 'APPROVE_FIRST';
  sessionName: string | null;
  hasSession: boolean;
}) {
  const t = useTranslations('gallery');
  const [name, setName] = React.useState(sessionName ?? '');
  const [ready, setReady] = React.useState(hasSession);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(false);
    try {
      const response = (await fetch(`/api/gallery/${code}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, ...(access ? { access } : {}) }),
      }).then((r) => r.json())) as SessionResponse;
      if (!response.ok) throw new Error('session failed');
      setReady(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) {
    return (
      <form onSubmit={saveName} className="flex flex-col gap-3">
        <div>
          <label htmlFor="upload-name" className="mb-1 block text-sm font-medium">
            {t('firstName')}
          </label>
          <input
            id="upload-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('firstNamePlaceholder')}
            autoComplete="given-name"
            maxLength={80}
            className="border-border bg-bg text-text h-11 w-full rounded-md border px-3 text-base"
          />
        </div>
        <p className="text-muted text-xs">{t('consentLine')}</p>
        {error && <p className="text-danger text-sm">{t('startError')}</p>}
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-strong text-on-brand w-full rounded-md py-3 text-base font-semibold disabled:opacity-50"
        >
          {saving ? t('starting') : t('continue')}
        </button>
      </form>
    );
  }

  return (
    <UploadQueueProvider eventId={eventId} galleryId={galleryId} album="GUEST" kind="MIXED" autoUpload>
      <Sheet moderation={moderation} />
    </UploadQueueProvider>
  );
}
