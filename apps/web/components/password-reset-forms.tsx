'use client';

import { Button, FieldShell, Input } from '@tiwa/ui';
import { ArrowRight, CheckCircle2, Eye, EyeOff, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { authClient } from '@/lib/auth-client.js';

/** Step 1 (D-X51): username or email in; the same answer whether or not it exists. */
export function ForgotPasswordForm() {
  const t = useTranslations('auth.reset');
  const [identifier, setIdentifier] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(undefined);
    try {
      const response = await fetch('/api/account/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier }),
      });
      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) setError(result.error ?? t('generic'));
      else setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div data-frame="guest" className="flex flex-col">
      <h1 className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">{t('forgotTitle')}</h1>
      <p className="text-muted mt-2 mb-8 text-base">{t('forgotBody')}</p>
      {sent ? (
        <div className="border-success/40 bg-success/5 flex items-start gap-3 rounded-2xl border p-4" role="status">
          <MailCheck className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t('sentTitle')}</p>
            <p className="text-muted text-sm">{t('sentBody')}</p>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          <FieldShell id="reset-identifier" label={t('identifierLabel')}>
            {(describedBy) => (
              <Input
                id="reset-identifier"
                aria-describedby={describedBy}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="ada.events or you@example.com"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            )}
          </FieldShell>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={sending}
            disabled={identifier.trim().length < 3}
            className="rounded-xl"
          >
            {t('send')}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="text-muted text-xs">{t('noEmailNote')}</p>
        </form>
      )}
      <p className="text-muted mt-8 text-center text-sm">
        <Link href="/login" className="text-text font-medium underline-offset-4 hover:underline">
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  );
}

/** Step 2: the link lands here with ?token= (or ?error=INVALID_TOKEN). */
export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const t = useTranslations('auth.reset');
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) return setError(t('tooShort'));
    if (password !== confirm) return setError(t('mismatch'));
    if (!token) return;
    setSaving(true);
    setError(undefined);
    const result = await authClient.resetPassword({ newPassword: password, token });
    setSaving(false);
    if (result.error) {
      setError(result.error.code === 'INVALID_TOKEN' ? t('invalidBody') : (result.error.message ?? t('generic')));
      return;
    }
    setDone(true);
    window.setTimeout(() => router.push('/login'), 1800);
  }

  if (invalid || !token) {
    return (
      <div data-frame="guest" className="flex flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-[-0.02em]">{t('invalidTitle')}</h1>
        <p className="text-muted">{t('invalidBody')}</p>
        <Link href="/forgot-password" className="text-brand-strong font-semibold hover:underline">
          {t('requestNew')}
        </Link>
      </div>
    );
  }

  return (
    <div data-frame="guest" className="flex flex-col">
      <h1 className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">{t('resetTitle')}</h1>
      <p className="text-muted mt-2 mb-8 text-base">{t('resetBody')}</p>
      {done ? (
        <div className="border-success/40 bg-success/5 flex items-start gap-3 rounded-2xl border p-4" role="status">
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t('doneTitle')}</p>
            <p className="text-muted text-sm">{t('doneBody')}</p>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
          {(['password', 'confirm'] as const).map((field) => (
            <FieldShell
              key={field}
              id={`reset-${field}`}
              label={field === 'password' ? t('newLabel') : t('confirmLabel')}
              hint={field === 'password' ? t('hint') : undefined}
            >
              {(describedBy) => (
                <Input
                  id={`reset-${field}`}
                  aria-describedby={describedBy}
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={field === 'password' ? password : confirm}
                  onChange={(event) => (field === 'password' ? setPassword : setConfirm)(event.target.value)}
                  suffix={
                    field === 'password' ? (
                      <button
                        type="button"
                        onClick={() => setShow((value) => !value)}
                        aria-label={show ? t('hide') : t('show')}
                        className="text-muted hover:text-text grid size-8 place-items-center rounded-lg"
                      >
                        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    ) : undefined
                  }
                />
              )}
            </FieldShell>
          ))}
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={saving}
            disabled={!password || !confirm}
            className="rounded-xl"
          >
            {t('save')}
          </Button>
        </form>
      )}
    </div>
  );
}
