'use client';

import { Banner, Button, Card, ConfirmDialog } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { completePortfolioItem, removePortfolioPhoto, startPortfolioItem } from './actions.js';

export interface PortfolioPhoto {
  id: string;
  url: string;
  caption: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function PortfolioManager({
  orgId,
  photos,
  needed,
}: {
  orgId: string;
  photos: PortfolioPhoto[];
  needed: number;
}) {
  const t = useTranslations('business');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        const started = await startPortfolioItem({
          orgId,
          mime: file.type,
          sizeBytes: file.size,
        });
        if (!started.ok) throw new Error(started.code);
        const put = await fetch(started.data.uploadUrl, { method: 'PUT', body: file });
        if (!put.ok) throw new Error('UPLOAD_FAILED');
        const done = await completePortfolioItem({ orgId, itemId: started.data.itemId });
        if (!done.ok) throw new Error(done.code);
      }
      router.refresh();
    } catch {
      setError(t('errors.generic'));
    } finally {
      setUploading(false);
    }
  }

  async function onRemove(itemId: string) {
    const result = await removePortfolioPhoto({ orgId, itemId });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else router.refresh();
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold tracking-tight">{t('portfolioHeading')}</h3>
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? t('uploading') : t('uploadPhotos')}
          </Button>
        </div>
        <p className="text-muted text-sm">{t('portfolioBody', { count: needed })}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={onFiles} />
        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg">
                <img src={photo.url} alt={photo.caption ?? ''} className="size-full object-cover" loading="lazy" />
                <ConfirmDialog
                  trigger={
                    <button
                      type="button"
                      aria-label={t('removePhoto')}
                      className="bg-surface/90 absolute top-1 right-1 rounded-full px-2 py-1 text-xs"
                    >
                      ✕
                    </button>
                  }
                  title={t('removePhotoTitle')}
                  body={t('archiveBody')}
                  confirmLabel={t('removePhoto')}
                  onConfirm={() => void onRemove(photo.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
