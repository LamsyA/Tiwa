'use client';

import { Banner, Button, Card, StatusPill } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  removeVerificationDoc,
  setProfilePublished,
  startVerificationDoc,
  submitBusinessVerification,
} from './actions.js';

interface StagedDoc {
  type: 'id' | 'cac' | 'other';
  storageKey: string;
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';

/** P6-T03: publish gate + verification submission. */
export function PublishManager({
  orgId,
  published,
  publishable,
  verificationStatus,
}: {
  orgId: string;
  published: boolean;
  publishable: boolean;
  verificationStatus: string | null;
}) {
  const t = useTranslations('business');
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [docs, setDocs] = React.useState<StagedDoc[]>([]);
  const [uploading, setUploading] = React.useState<string | null>(null);
  const idRef = React.useRef<HTMLInputElement>(null);
  const cacRef = React.useRef<HTMLInputElement>(null);

  async function onTogglePublish() {
    setError(null);
    const result = await setProfilePublished({ orgId, published: !published });
    if (!result.ok) setError(result.code === 'CONFLICT' ? t('publishBlocked') : t(`errors.${result.code}`));
    else router.refresh();
  }

  async function onFile(type: StagedDoc['type'], file: File | undefined) {
    if (!file) return;
    setUploading(type);
    setError(null);
    try {
      const started = await startVerificationDoc({ orgId, docType: type, mime: file.type, sizeBytes: file.size });
      if (!started.ok) throw new Error(started.code);
      const put = await fetch(started.data.uploadUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('UPLOAD_FAILED');
      setDocs((current) => [
        ...current.filter((doc) => doc.type !== type),
        { type, storageKey: started.data.storageKey },
      ]);
    } catch {
      setError(t('errors.generic'));
    } finally {
      setUploading(null);
    }
  }

  async function onRemoveDoc(doc: StagedDoc) {
    await removeVerificationDoc({ orgId, storageKey: doc.storageKey });
    setDocs((current) => current.filter((item) => item.storageKey !== doc.storageKey));
  }

  async function onSubmit() {
    setError(null);
    const result = await submitBusinessVerification({ orgId, documents: docs });
    if (!result.ok) setError(t(`errors.${result.code}`));
    else {
      setDocs([]);
      router.refresh();
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="font-medium">{t('publishHeading')}</h3>
          <p className="text-muted text-sm">{t('publishBody')}</p>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
        {published ? (
          <div className="flex items-center gap-3">
            <StatusPill tone="success">{t('live')}</StatusPill>
            <Button variant="secondary" onClick={onTogglePublish}>
              {t('unpublish')}
            </Button>
          </div>
        ) : (
          <div>
            <Button onClick={onTogglePublish} disabled={!publishable}>
              {t('publish')}
            </Button>
            {!publishable && <p className="text-muted mt-1 text-sm">{t('publishBlocked')}</p>}
          </div>
        )}
        <div className="border-border border-t pt-4">
          <h3 className="font-medium">{t('verificationHeading')}</h3>
          <p className="text-muted text-sm">{t('verificationBody')}</p>
          {verificationStatus === 'PENDING' ? (
            <div className="mt-2 flex items-center gap-3">
              <StatusPill tone="warning">{t('pending')}</StatusPill>
              <span className="text-muted text-sm">{t('verifySubmitted')}</span>
            </div>
          ) : verificationStatus === 'APPROVED' ? (
            <div className="mt-2">
              <StatusPill tone="success">{t('done')}</StatusPill>
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => idRef.current?.click()} disabled={uploading !== null}>
                  {uploading === 'id' ? t('verifyUploading') : t('verifyIdLabel')}
                </Button>
                {docs.some((doc) => doc.type === 'id') && <StatusPill tone="success">{t('done')}</StatusPill>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => cacRef.current?.click()} disabled={uploading !== null}>
                  {uploading === 'cac' ? t('verifyUploading') : t('verifyCacLabel')}
                </Button>
                {docs.some((doc) => doc.type === 'cac') && <StatusPill tone="success">{t('done')}</StatusPill>}
              </div>
              <input
                ref={idRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void onFile('id', file);
                }}
              />
              <input
                ref={cacRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void onFile('cac', file);
                }}
              />
              {docs.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {docs.map((doc) => (
                    <li key={doc.storageKey} className="flex items-center gap-2">
                      <span>{doc.type.toUpperCase()}</span>
                      <button type="button" className="underline" onClick={() => void onRemoveDoc(doc)}>
                        {t('removeDoc')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div>
                <Button onClick={onSubmit} disabled={docs.length === 0 || uploading !== null}>
                  {t('verifySubmit')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
