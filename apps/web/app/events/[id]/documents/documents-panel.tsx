'use client';

import { Banner, Button, ConfirmDialog, EmptyState, RelativeTime } from '@tiwa/ui';
import { Download, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useLive } from '@/hooks/use-live.js';
import { completeUpload, removeDocument, startUpload } from './actions.js';

interface DocumentRow {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.docx,.xlsx,.pptx';
/** Some browsers leave `type` empty (HEIC, Office files); fall back to the extension. */
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function mimeOf(file: File): string {
  return file.type || BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''] || 'application/octet-stream';
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({
  eventId,
  canEdit,
  documents,
}: {
  eventId: string;
  canEdit: boolean;
  documents: DocumentRow[];
}) {
  const t = useTranslations('events.documents');
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(0);
  useLive(`/api/sse/event/${eventId}`, () => router.refresh());

  const errorFor = (name: string, key: string | undefined) =>
    t(`errors.${key && t.has(`errors.${key}`) ? key : 'generic'}`, { name });

  async function uploadOne(file: File): Promise<string | null> {
    const mime = mimeOf(file);
    const started = await startUpload({ eventId, name: file.name, mime, sizeBytes: file.size });
    if (!started.ok) return errorFor(file.name, Object.values(started.fieldErrors ?? {}).flat()[0]);
    const put = await fetch(started.data.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': mime },
    }).catch(() => null);
    if (!put?.ok) return errorFor(file.name, 'uploadFailed');
    const completed = await completeUpload({ eventId, documentId: started.data.documentId });
    if (!completed.ok) return errorFor(file.name, Object.values(completed.fieldErrors ?? {}).flat()[0]);
    return null;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErrors([]);
    setDone(0);
    const failures: string[] = [];
    let ok = 0;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      const failure = await uploadOne(file);
      if (failure) failures.push(failure);
      else ok += 1;
    }
    setBusy(null);
    setErrors(failures);
    setDone(ok);
    if (input.current) input.current.value = '';
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted text-sm">{t('hint')}</p>
      {!canEdit && <Banner tone="info">{t('readOnly')}</Banner>}
      {canEdit && (
        <div>
          <input
            ref={input}
            id="document-files"
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => void upload(event.target.files)}
          />
          <Button
            loading={busy !== null}
            onClick={() => input.current?.click()}
            iconLeft={<Upload aria-hidden className="size-5" />}
          >
            {t('upload')}
          </Button>
          {busy && (
            <p role="status" className="text-muted mt-2 text-sm">
              {t('uploading', { name: busy })}
            </p>
          )}
          {!busy && done > 0 && (
            <p role="status" className="text-success mt-2 text-sm">
              {t('uploaded', { count: done })}
            </p>
          )}
        </div>
      )}
      {errors.map((message) => (
        <Banner key={message} tone="danger">
          {message}
        </Banner>
      ))}

      {documents.length === 0 ? (
        <EmptyState icon={<FileText className="size-8" aria-hidden />} title={t('heading')} body={t('empty')} />
      ) : (
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 p-3">
              <FileText aria-hidden className="text-muted size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{doc.name}</p>
                <p className="text-muted text-sm">
                  {formatSize(doc.sizeBytes)} · <RelativeTime value={doc.createdAt} />
                </p>
              </div>
              <a
                href={`/api/documents/${eventId}/${doc.id}`}
                aria-label={t('download', { name: doc.name })}
                className="text-text hover:bg-surface-2 focus-visible:outline-focus flex size-11 items-center justify-center rounded-md focus-visible:outline-2"
              >
                <Download aria-hidden className="size-5" />
              </a>
              {canEdit && (
                <ConfirmDialog
                  destructive
                  trigger={
                    <Button size="sm" variant="ghost">
                      {t('delete')}
                    </Button>
                  }
                  title={t('deleteTitle', { name: doc.name })}
                  body={t('deleteBody')}
                  confirmLabel={t('delete')}
                  onConfirm={() => void removeDocument({ eventId, documentId: doc.id }).then(() => router.refresh())}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
