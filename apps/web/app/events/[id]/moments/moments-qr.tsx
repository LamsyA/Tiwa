'use client';

import { Banner, Button, Card, Input, QRCode, qrSvg } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

/**
 * Gallery QR downloads (P5-T08): PNG for screens, A6 table card and A4
 * poster PDFs via dynamic jsPDF, badge PNG for stickers. Same printing
 * pipeline as the invite share section (P4-T05).
 */
export function MomentsQrCard({ eventName, galleryUrl }: { eventName: string; galleryUrl: string }) {
  const t = useTranslations('events.momentsPage');
  const te = useTranslations('events.momentsPage.errors');
  const [copied, setCopied] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function copy() {
    await navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function downloadPng(size: 512 | 1024, filename: string) {
    setBusy(true);
    setError(undefined);
    try {
      const svg = qrSvg(galleryUrl, size);
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const image = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = size + 64;
        canvas.height = size + 64;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('no canvas');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 32, 32, size, size);
        const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!png) throw new Error('no png');
        triggerDownload(URL.createObjectURL(png), filename);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="font-medium">{t('qrTitle')}</h3>
        <p className="text-muted text-sm">{t('qrBody')}</p>
      </div>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-56 sm:shrink-0">
          <QRCode
            value={galleryUrl}
            size={224}
            label={t('qrTitle')}
            className="text-text max-w-56 rounded-md border p-2"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex gap-2">
            <Input
              value={galleryUrl}
              readOnly
              aria-label={t('copyLink')}
              className="min-w-0 flex-1"
              onChange={() => undefined}
            />
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? t('copied') : t('copyLink')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void downloadPng(1024, `${slug(eventName)}-gallery-qr.png`)}
            >
              {t('downloadPng')}
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void downloadPoster('a6')}>
              {t('downloadCard')}
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void downloadPoster('a4')}>
              {t('downloadPoster')}
            </Button>
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void downloadPng(512, `${slug(eventName)}-gallery-badge.png`)}
            >
              {t('downloadBadge')}
            </Button>
            <a href={galleryUrl} target="_blank" rel="noreferrer" className="text-sm font-medium underline self-center">
              {t('openGallery')}
            </a>
          </div>
        </div>
      </div>
    </Card>
  );

  async function downloadPoster(size: 'a6' | 'a4') {
    setBusy(true);
    setError(undefined);
    try {
      const { jsPDF } = await import('jspdf');
      const portrait: [number, number] = size === 'a6' ? [105, 148] : [210, 297];
      const doc = new jsPDF({ unit: 'mm', format: portrait });
      const [width, height] = portrait;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size === 'a6' ? 16 : 24);
      const lines = doc.splitTextToSize(eventName, width - 30);
      doc.text(lines, width / 2, size === 'a6' ? 28 : 44, { align: 'center' });
      const qrSide = size === 'a6' ? 70 : 120;
      const qrPng = await qrPngDataUrl(galleryUrl, 1024);
      doc.addImage(qrPng, 'PNG', (width - qrSide) / 2, (height - qrSide) / 2 - 6, qrSide, qrSide);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size === 'a6' ? 11 : 14);
      doc.text(t('qrTitle'), width / 2, (height + qrSide) / 2 + 4, { align: 'center' });
      doc.setFontSize(size === 'a6' ? 8 : 10);
      doc.text(galleryUrl, width / 2, height - 12, { align: 'center', maxWidth: width - 20 });
      doc.save(`${slug(eventName)}-gallery-${size}.pdf`);
    } catch {
      setError(te('generic'));
    } finally {
      setBusy(false);
    }
  }
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
