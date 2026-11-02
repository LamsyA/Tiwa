'use client';

import { Button, Card, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { scanAction, checkInByIdAction, searchPassesAction, syncOfflineAction } from './actions.js';

interface OfflineEntry {
  kind: 'ticket' | 'guest';
  id: string;
  name: string;
  qr: string;
  checkedIn: boolean;
}
interface QueuedScan {
  qrValue: string;
  scannedAt: string;
}

const deviceKey = 'tiwa-checkin-device';
const listKey = (eventId: string) => `tiwa-offline-list:${eventId}`;
const queueKey = (eventId: string) => `tiwa-offline-queue:${eventId}`;

function deviceId(): string {
  let id = typeof localStorage !== 'undefined' ? localStorage.getItem(deviceKey) : null;
  if (!id) {
    id = `door-${Math.random().toString(36).slice(2, 10)}`;
    try {
      localStorage.setItem(deviceKey, id);
    } catch {
      /* private mode */
    }
  }
  return id;
}

/** Door scanner (P11-T06/T07, UF-23): manual entry + camera, live counter, offline queue. */
export function CheckinClient({ eventId, initial }: { eventId: string; initial: string }) {
  const t = useTranslations('checkin');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [count, setCount] = useState<string>(initial);
  const [pending, setPending] = useState(false);
  const [offlineCount, setOfflineCount] = useState<number>(() => {
    try {
      return (JSON.parse(localStorage.getItem(queueKey(eventId)) ?? '[]') as QueuedScan[]).length;
    } catch {
      return 0;
    }
  });
  const [storedCount, setStoredCount] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(listKey(eventId));
      return stored ? (JSON.parse(stored) as { entries: OfflineEntry[] }).entries.length : null;
    } catch {
      return null;
    }
  });
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<{ kind: 'ticket' | 'guest'; id: string; name: string; checkedIn: boolean }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scanning, setScanning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/checkin/${eventId}/stats`);
      const body = await response.json();
      if (body.ok)
        setCount(t('counter', { tin: body.data.ticketsIn, gin: body.data.guestsIn, expected: body.data.expected }));
    } catch {
      /* polling is best-effort */
    }
  }, [eventId, t]);

  useEffect(() => {
    const source = new EventSource(`/api/sse/checkin/${eventId}`);
    source.addEventListener('change', () => void refresh());
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [eventId, refresh]);

  const show = (tone: 'ok' | 'warn' | 'bad', text: string) => {
    setResult({ tone, text });
    try {
      if (tone === 'ok' && navigator.vibrate) navigator.vibrate(40);
      else if (tone === 'bad' && navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch {
      /* no haptics */
    }
  };

  const submit = async (qrValue: string) => {
    const trimmed = qrValue.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      const response = await scanAction({ eventId, qrValue: trimmed, deviceId: deviceId() });
      if (!response.ok) {
        // Offline (or expired session): match against the downloaded list and queue.
        const stored = localStorage.getItem(listKey(eventId));
        if (stored) {
          const list = JSON.parse(stored) as { entries: OfflineEntry[] };
          const hit = list.entries.find((entry) => entry.qr === trimmed);
          const queued = [
            ...(JSON.parse(localStorage.getItem(queueKey(eventId)) ?? '[]') as QueuedScan[]),
            { qrValue: trimmed, scannedAt: new Date().toISOString() },
          ];
          localStorage.setItem(queueKey(eventId), JSON.stringify(queued));
          setOfflineCount(queued.length);
          show('warn', hit ? `${hit.name} (queued offline)` : t('notValid'));
        } else {
          show('bad', t('notValid'));
        }
        return;
      }
      const outcome = response.data;
      if (outcome.result === 'OK') {
        show('ok', t('welcome', { name: outcome.holderName ?? '?' }));
        try {
          const audio = new AudioContext();
          const beep = audio.createOscillator();
          beep.frequency.value = 880;
          beep.connect(audio.destination);
          beep.start();
          beep.stop(audio.currentTime + 0.12);
          void audio.close();
        } catch {
          /* silent devices */
        }
      } else if (outcome.result === 'DUPLICATE') {
        show('warn', t('alreadyIn', { at: outcome.checkedInAt ?? '?' }));
      } else {
        show('bad', t(outcome.messageKey === 'wrongEvent' ? 'wrongEvent' : 'notValid'));
      }
      setValue('');
      void refresh();
    } finally {
      setPending(false);
    }
  };

  const downloadOffline = async () => {
    try {
      const response = await fetch(`/api/checkin/${eventId}/offline-list`);
      const body = await response.json();
      if (!body.ok) throw new Error('download');
      localStorage.setItem(listKey(eventId), JSON.stringify(body.data));
      setStoredCount(body.data.entries.length);
      show('ok', t('offlineReady', { count: body.data.entries.length }));
    } catch {
      show('bad', t('downloadError'));
    }
  };

  const syncQueued = async () => {
    const queued = JSON.parse(localStorage.getItem(queueKey(eventId)) ?? '[]') as QueuedScan[];
    if (queued.length === 0) return;
    const response = await syncOfflineAction({ eventId, deviceId: deviceId(), scans: queued.slice(0, 1000) });
    if (response.ok) {
      localStorage.setItem(queueKey(eventId), '[]');
      setOfflineCount(0);
      show(
        'ok',
        t('synced', { ok: response.data.ok, duplicates: response.data.duplicates, invalid: response.data.invalid }),
      );
      void refresh();
    }
  };

  const runSearch = async () => {
    if (search.trim().length < 2 || pending) return;
    setPending(true);
    try {
      const response = await searchPassesAction({ eventId, query: search.trim() });
      if (response.ok) setHits(response.data);
    } finally {
      setPending(false);
    }
  };

  const checkInHit = async (hit: { kind: 'ticket' | 'guest'; id: string; name: string }) => {
    setPending(true);
    try {
      const response = await checkInByIdAction({ eventId, entryId: hit.id, kind: hit.kind, deviceId: deviceId() });
      if (!response.ok) {
        show('bad', t('notValid'));
        return;
      }
      const outcome = response.data;
      if (outcome.result === 'OK') show('ok', t('welcome', { name: outcome.holderName ?? '?' }));
      else if (outcome.result === 'DUPLICATE') show('warn', t('alreadyIn', { at: outcome.checkedInAt ?? '?' }));
      else show('bad', t('notValid'));
      void runSearch();
      void refresh();
    } finally {
      setPending(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector =
        'BarcodeDetector' in window
          ? new (
              window as unknown as {
                BarcodeDetector: new (opts: { formats: string[] }) => {
                  detect(v: HTMLVideoElement): Promise<{ rawValue: string }[]>;
                };
              }
            ).BarcodeDetector({ formats: ['qr_code'] })
          : null;
      if (!detector) return; // manual entry stays available; no extra deps for one format
      const tick = async () => {
        if (!videoRef.current?.srcObject) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            stream.getTracks().forEach((track) => track.stop());
            setScanning(false);
            await submit(codes[0].rawValue);
            return;
          }
        } catch {
          /* keep scanning */
        }
        requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      show('bad', t('notValid'));
    }
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      {count && (
        <p className="text-muted text-sm" aria-live="polite">
          {count}
        </p>
      )}
      {result && (
        <Card
          className={`p-4 text-center font-medium ${result.tone === 'ok' ? 'bg-success-soft text-success' : result.tone === 'warn' ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'}`}
          role={result.tone === 'ok' ? 'status' : 'alert'}
        >
          {result.text}
        </Card>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t('manual')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('manualPlaceholder')}
          className="flex-1"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit(value);
          }}
        />
        <Button disabled={pending || !value.trim()} onClick={() => void submit(value)}>
          {t('checkIn')}
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={t('searchLabel')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          className="flex-1"
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runSearch();
          }}
        />
        <Button variant="secondary" disabled={pending || search.trim().length < 2} onClick={() => void runSearch()}>
          {t('searchAction')}
        </Button>
      </div>
      {hits.length > 0 && (
        <ul className="flex flex-col gap-2">
          {hits.map((hit) => (
            <li key={`${hit.kind}:${hit.id}`} className="flex items-center gap-2 border-t pt-2 text-sm">
              <span className="font-medium">{hit.name}</span>
              <span className="text-muted">
                {hit.checkedIn ? t('alreadyIn', { at: '?' }) : hit.kind === 'ticket' ? t('kindTicket') : t('kindGuest')}
              </span>
              <span className="ml-auto" />
              <Button variant="secondary" disabled={pending} onClick={() => void checkInHit(hit)}>
                {t('checkIn')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void startCamera()}>
          {t('startScanning')}
        </Button>
        <Button variant="secondary" onClick={() => void downloadOffline()}>
          {t('offline')}
        </Button>
        {offlineCount > 0 && (
          <Button variant="secondary" onClick={() => void syncQueued()}>
            {t('sync')} ({offlineCount})
          </Button>
        )}
      </div>
      {storedCount != null && <p className="text-muted text-sm">{t('offlineReady', { count: storedCount })}</p>}
      {scanning && (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-lg bg-black"
          muted
          playsInline
          aria-label={t('startScanning')}
        />
      )}
      {!scanning && <video ref={videoRef} className="hidden" muted playsInline />}
    </div>
  );
}
