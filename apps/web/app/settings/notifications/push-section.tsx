'use client';

import { Button, Card } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0))).buffer as ArrayBuffer;
}

/** Web push onboarding (P13-T03): permission, subscription, server record. */
export function PushSection() {
  const t = useTranslations('notifications');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const enable = () => {
    setError(null);
    start(async () => {
      try {
        if (!supported) {
          setError('pushUnsupported');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setError('pushDenied');
          return;
        }
        const keyResponse = await fetch('/api/push/vapid-public-key');
        const keyBody = (await keyResponse.json()) as { ok: boolean; data?: { publicKey?: string } };
        if (!keyBody.ok || !keyBody.data?.publicKey) {
          setError('pushUnavailable');
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyBody.data.publicKey),
          }));
        const keys = subscription.toJSON().keys;
        if (!keys?.p256dh || !keys?.auth) {
          setError('pushUnavailable');
          return;
        }
        const save = await fetch('/api/push/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }),
        });
        const saved = (await save.json()) as { ok: boolean };
        if (!saved.ok) setError('saveFailed');
        else setEnabled(true);
      } catch {
        setError('pushUnavailable');
      }
    });
  };

  const disable = () => {
    setError(null);
    start(async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await fetch('/api/push/subscriptions', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
        setEnabled(false);
      } catch {
        setError('saveFailed');
      }
    });
  };

  return (
    <Card className="flex flex-col gap-2 p-4 text-sm">
      <span className="font-medium">{t('pushTitle')}</span>
      {error && <p className="text-danger text-sm">{t(error)}</p>}
      {enabled === true && <p>{t('pushOn')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || !supported} onClick={enable}>
          {t('pushEnable')}
        </Button>
        <Button variant="secondary" disabled={pending || !supported} onClick={disable}>
          {t('pushDisable')}
        </Button>
      </div>
      {!supported && <p className="text-muted text-xs">{t('pushUnsupported')}</p>}
    </Card>
  );
}
