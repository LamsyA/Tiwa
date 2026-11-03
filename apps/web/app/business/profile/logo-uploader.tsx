'use client';

import { Banner } from '@tiwa/ui';
import { ImagePlus, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { completeBusinessLogo, startBusinessLogo } from './actions.js';

/** Business logo (D-X47): shown on proposals, invoices and the public profile. */
export function LogoUploader({ orgId, orgName, hasLogo }: { orgId: string; orgName: string; hasLogo: boolean }) {
  const t = useTranslations('business.logo');
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const started = await startBusinessLogo({ orgId, mime: file.type, sizeBytes: file.size });
      if (!started.ok) throw new Error(started.fieldErrors ? Object.values(started.fieldErrors)[0]?.[0] : started.code);
      const put = await fetch(started.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!put.ok) throw new Error('upload');
      const done = await completeBusinessLogo({ orgId, key: started.data.key });
      if (!done.ok) throw new Error('typeNotAllowed');
      setVersion((value) => value + 1);
      router.refresh();
    } catch (failure) {
      const key = failure instanceof Error ? failure.message : '';
      setError(t.has(`errors.${key}`) ? t(`errors.${key}`) : t('errors.generic'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const initials = orgName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');

  return (
    <section className="border-border/70 bg-surface flex flex-col gap-3 rounded-3xl border p-5 shadow-[var(--shadow-1)] sm:flex-row sm:items-center sm:p-6">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={hasLogo ? t('change') : t('add')}
        className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] transition hover:border-[var(--brand)]"
      >
        {hasLogo ? (
          <img src={`/api/org-logo/${orgId}?v=${version}`} alt="" className="size-full bg-white object-contain p-1.5" />
        ) : (
          <span className="font-display text-muted text-xl font-bold">{initials}</span>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {busy ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <ImagePlus aria-hidden className="size-5" />
          )}
        </span>
      </button>
      <div className="flex-1">
        <h2 className="font-display text-lg font-bold tracking-tight">{t('heading')}</h2>
        <p className="text-muted text-sm">{t('body')}</p>
        {error && (
          <Banner tone="danger" className="mt-2">
            {error}
          </Banner>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
    </section>
  );
}
