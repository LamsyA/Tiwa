'use client';

import { Banner, Button, Card, Input, QRCode, Switch, qrSvg } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { setSharedLink } from './actions.js';

export function ShareSection({
  eventId,
  eventName,
  shareUrl,
  sharedOn,
  canManage,
}: {
  eventId: string;
  eventName: string;
  shareUrl: string;
  sharedOn: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('events.invites');
  const te = useTranslations('events.invites.errors');
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [canShare] = React.useState(() => typeof navigator !== 'undefined' && 'share' in navigator);

  async function copy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadPng() {
    setBusy(true);
    setError(undefined);
    try {
      const svg = qrSvg(shareUrl, 1024);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      try {
        const image = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no canvas');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 88, 88, 1024, 1024);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('no png');
        triggerDownload(URL.createObjectURL(png), `${slug(eventName)}-qr.png`);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  async function downloadPoster(size: 'a6' | 'a4') {
    setBusy(true);
    setError(undefined);
    try {
      const { jsPDF } = await import('jspdf');
      // jsPDF is dynamically imported so ~350 KB never lands in the page bundle.
      const portrait: [number, number] = size === 'a6' ? [105, 148] : [210, 297];
      const doc = new jsPDF({ unit: 'mm', format: portrait });
      const [width, height] = portrait;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size === 'a6' ? 16 : 24);
      const lines = doc.splitTextToSize(eventName, width - 30);
      doc.text(lines, width / 2, size === 'a6' ? 28 : 44, { align: 'center' });
      const qrSide = size === 'a6' ? 70 : 120;
      const qrPng = await qrPngDataUrl(shareUrl, 1024);
      doc.addImage(qrPng, 'PNG', (width - qrSide) / 2, (height - qrSide) / 2 - 6, qrSide, qrSide);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size === 'a6' ? 11 : 14);
      doc.text(t('share.posterTitle'), width / 2, (height + qrSide) / 2 + 4, { align: 'center' });
      doc.setFontSize(size === 'a6' ? 8 : 10);
      doc.text(shareUrl, width / 2, height - 12, { align: 'center', maxWidth: width - 20 });
      doc.save(`${slug(eventName)}-qr-${size}.pdf`);
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  async function webShare() {
    try {
      await navigator.share({ title: eventName, url: shareUrl });
    } catch {
      // dismissed — nothing to do
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="font-medium">{t('share.title')}</h3>
        <p className="text-muted text-sm">{t('share.body')}</p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      {canManage && (
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <Switch
            checked={sharedOn}
            disabled={busy}
            onCheckedChange={(next) => {
              setBusy(true);
              void setSharedLink({ eventId, enabled: next }).then((result) => {
                setBusy(false);
                if (!result.ok) {
                  try {
                    setError(te(result.code));
                  } catch {
                    setError(te('generic'));
                  }
                } else router.refresh();
              });
            }}
            aria-label={sharedOn ? t('share.toggleOff') : t('share.toggleOn')}
          />
          {sharedOn ? t('share.toggleOff') : t('share.toggleOn')}
        </label>
      )}
      {!sharedOn ? (
        <p className="text-muted text-sm">{t('share.offNote')}</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="sm:w-56 sm:shrink-0">
            <p className="mb-2 text-sm font-medium">{t('share.qrLabel')}</p>
            <QRCode
              value={shareUrl}
              size={224}
              label={t('share.qrLabel')}
              className="text-text max-w-56 rounded-md border p-2"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="mb-1 text-sm font-medium">{t('share.linkLabel')}</p>
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  aria-label={t('share.linkLabel')}
                  className="min-w-0 flex-1"
                  onChange={() => undefined}
                />
                <Button variant="secondary" onClick={() => void copy()}>
                  {copied ? t('share.copied') : t('share.copy')}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy} onClick={() => void downloadPng()}>
                {t('share.downloadPng')}
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void downloadPoster('a6')}>
                {t('share.downloadA6')}
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => void downloadPoster('a4')}>
                {t('share.downloadA4')}
              </Button>
              {canShare && (
                <Button variant="secondary" onClick={() => void webShare()}>
                  {t('share.webShare')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function slug(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'event'
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('qr image failed'));
    image.src = url;
  });
}

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

async function qrPngDataUrl(value: string, size: number): Promise<string> {
  // currentColor has no CSS context inside a blob image, so modules render
  // black — exactly what print wants on the white background.
  const svg = qrSvg(value, size);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
