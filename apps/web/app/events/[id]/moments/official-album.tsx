'use client';

import { Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { UploadQueueProvider, useUploadQueue } from '@/components/uploads/upload-queue.js';

function OfficialQueue() {
  const t = useTranslations('events.momentsPage');
  const tg = useTranslations('gallery');
  const queue = useUploadQueue();
  const filesRef = React.useRef<HTMLInputElement>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    if (picked.length > 0) queue.addFiles(picked);
    event.target.value = '';
  };

  const done = queue.files.filter((file) => file.status === 'complete').length;
  const active = queue.files.filter((file) => file.status === 'uploading' || file.status === 'queued').length;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('dropHint')}
        onClick={() => filesRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') filesRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const dropped = Array.from(event.dataTransfer.files);
          if (dropped.length > 0) queue.addFiles(dropped);
        }}
        className={
          dragging
            ? 'border-brand-strong bg-surface-2 rounded-md border-2 border-dashed p-6 text-center'
            : 'border-border rounded-md border-2 border-dashed p-6 text-center'
        }
      >
        <p className="text-sm font-medium">{t('dropHint')}</p>
        <p className="text-muted mt-1 text-xs">{t('folderHint')}</p>
      </div>
      <input
        ref={filesRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        aria-label={t('chooseFiles')}
        onChange={onPick}
      />
      <input
        ref={folderRef}
        type="file"
        /* Folders arrive flat with relative paths; the queue shows file names. */
        {...({ webkitdirectory: '' } as Record<string, string>)}
        className="sr-only"
        aria-label={t('chooseFolder')}
        onChange={onPick}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => filesRef.current?.click()}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          {t('chooseFiles')}
        </button>
        <button
          type="button"
          onClick={() => folderRef.current?.click()}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          {t('chooseFolder')}
        </button>
        {queue.files.length > 0 && (
          <button type="button" onClick={() => queue.resume()} className="text-sm font-medium underline">
            {t('uploadNow', { count: queue.files.length })}
          </button>
        )}
      </div>
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
          <p className="text-muted mt-1 text-sm">{tg('uploadingOf', { active, total: queue.files.length })}</p>
        </div>
      )}
      {queue.files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {queue.files.map((file) => (
            <li key={file.id} className="border-border flex items-center gap-3 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-muted text-xs">
                  {file.status === 'complete'
                    ? tg('done')
                    : file.status === 'error'
                      ? (file.error ?? tg('failed'))
                      : `${Math.round(file.progress * 100)}%`}
                </p>
              </div>
              {file.status === 'error' && (
                <button
                  type="button"
                  onClick={() => queue.retryFile(file.id)}
                  className="text-sm font-medium underline"
                >
                  {tg('retry')}
                </button>
              )}
              {file.status !== 'complete' && (
                <button
                  type="button"
                  onClick={() => queue.removeFile(file.id)}
                  aria-label={tg('removePhoto', { name: file.name })}
                  className="text-muted px-2 text-lg"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {done > 0 && queue.files.length === done && <p className="text-muted mt-2 text-sm">{t('publishHint')}</p>}
    </div>
  );
}

/**
 * Official album uploads (P5-T10): desktop drag-and-drop plus whole-folder
 * pickup, uploading straight into the OFFICIAL album. Items land pending
 * and publish through the review queue below; published official photos
 * get the © watermark automatically.
 */
export function OfficialAlbumPanel({ eventId, galleryId }: { eventId: string; galleryId: string }) {
  const t = useTranslations('events.momentsPage');
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-medium">{t('officialTitle')}</h3>
        <p className="text-muted text-sm">{t('officialBody')}</p>
      </div>
      <UploadQueueProvider eventId={eventId} galleryId={galleryId} album="OFFICIAL" kind="MIXED" autoUpload>
        <OfficialQueue />
      </UploadQueueProvider>
      <p className="text-muted text-xs">{t('watermarkNote')}</p>
    </Card>
  );
}
