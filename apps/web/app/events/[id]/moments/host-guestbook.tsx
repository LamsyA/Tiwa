'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { setMomentGuestbookHidden } from './actions.js';

/**
 * Host guestbook wall (P5-T11, MOM-14): every entry with hide/restore plus a
 * client-side PDF export (dynamic jsPDF, same pipeline as QR posters).
 */
export function HostGuestbook({
  eventId,
  eventName,
  initialMessages,
}: {
  eventId: string;
  eventName: string;
  initialMessages: { id: string; name: string | null; body: string; createdAt: string; hidden: boolean }[];
}) {
  const t = useTranslations('events.momentsPage');
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function toggle(id: string, hidden: boolean) {
    setBusyId(id);
    const result = await setMomentGuestbookHidden({ eventId, messageId: id, hidden });
    setBusyId(null);
    if (result.ok) router.refresh();
  }

  async function exportPdf() {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const width = 210;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(eventName, width / 2, 24, { align: 'center' });
    doc.setFontSize(12);
    doc.text(t('guestbookTitle'), width / 2, 34, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    let y = 46;
    const visible = initialMessages.filter((m) => !m.hidden);
    for (const message of visible) {
      const lines = doc.splitTextToSize(`"${message.body}" — ${message.name ?? t('guestbookAnon')}`, width - 30);
      if (y + lines.length * 6 > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines, 15, y);
      y += lines.length * 6 + 6;
    }
    doc.save(`${eventName.slice(0, 40) || 'event'}-guestbook.pdf`);
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{t('guestbookSectionTitle')}</h3>
          <p className="text-muted text-sm">{t('guestbookSectionBody')}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => void exportPdf()}>
          {t('exportPdf')}
        </Button>
      </div>
      {initialMessages.length === 0 ? (
        <p className="text-muted py-4 text-center text-sm">{t('guestbookEmptyHost')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialMessages.map((message) => (
            <li
              key={message.id}
              className={
                message.hidden
                  ? 'border-border rounded-md border p-3 opacity-60'
                  : 'border-border rounded-md border p-3'
              }
            >
              <p className="text-sm">{message.body}</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="text-muted min-w-0 flex-1 truncate text-xs">
                  {message.name ?? t('guestbookAnon')} ·{' '}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(message.createdAt))}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === message.id}
                  onClick={() => void toggle(message.id, !message.hidden)}
                >
                  {message.hidden ? t('unhideMessage') : t('hideMessage')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
