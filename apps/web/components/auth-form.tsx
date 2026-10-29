'use client';

import { Button, FieldShell, GuestShell, Input } from '@tiwa/ui';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { OtpInput } from './otp-input.js';
import { signIn } from '@/lib/auth-client.js';

type Method = 'phone' | 'email' | 'google';
type Step = 'method' | 'code' | 'sent-link';

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; code?: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as { ok: boolean; error?: string; code?: string };
}

/** Shared signup/login form (UF-01 steps 1–2, UF-02). New users land on /onboarding, which bounces complete profiles to `next` (T04). */
export function AuthForm({ mode }: { mode: 'signup' | 'login' }) {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? undefined;

  const [method, setMethod] = React.useState<Method>('phone');
  const [step, setStep] = React.useState<Step>('method');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>(undefined);
  const [locked, setLocked] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [providers, setProviders] = React.useState<{ google: boolean }>({ google: false });

  React.useEffect(() => {
    void fetch('/api/auth/providers')
      .then((response) => response.json())
      .then((data: unknown) => {
        if (typeof data === 'object' && data !== null && 'google' in data) {
          setProviders({ google: Boolean((data as { google: unknown }).google) });
        }
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(target = phone) {
    setFormError(undefined);
    setSending(true);
    try {
      const result = await postJson('/api/auth/otp/send', { phone: target });
      if (!result.ok) {
        if (result.code === 'RATE_LIMITED') setLocked(true);
        setFormError(result.error);
        return false;
      }
      setCode('');
      setStep('code');
      setCooldown(30);
      return true;
    } finally {
      setSending(false);
    }
  }

  async function verify(submitted = code) {
    if (submitted.length !== 6) {
      setFormError(t('invalidCode'));
      return;
    }
    setFormError(undefined);
    setVerifying(true);
    try {
      const result = await postJson('/api/auth/otp/verify', { phone, code: submitted });
      if (!result.ok) {
        if (result.code === 'RATE_LIMITED') setLocked(true);
        setFormError(result.error);
        return;
      }
      router.push(`/onboarding${next ? `?next=${encodeURIComponent(next)}` : ''}`);
    } finally {
      setVerifying(false);
    }
  }

  async function sendLink() {
    setFormError(undefined);
    setSending(true);
    try {
      const result = await postJson('/api/auth/magic-link/send', { email });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setStep('sent-link');
    } finally {
      setSending(false);
    }
  }

  return (
    <GuestShell
      title={mode === 'signup' ? t('signupTitle') : t('loginTitle')}
      action={
        step === 'method' ? (
          method === 'phone' ? (
            <Button fullWidth loading={sending} onClick={() => void sendCode()}>
              {t('sendCode')}
            </Button>
          ) : method === 'email' ? (
            <Button fullWidth loading={sending} onClick={() => void sendLink()}>
              {t('sendLink')}
            </Button>
          ) : undefined
        ) : step === 'code' ? (
          <Button fullWidth loading={verifying} disabled={locked} onClick={() => void verify()}>
            {t('verify')}
          </Button>
        ) : undefined
      }
    >
      <p className="text-muted -mt-1 mb-4 text-base">{mode === 'signup' ? t('signupSubtitle') : t('loginSubtitle')}</p>

      {step === 'method' && (
        <div className="flex flex-col gap-4" role="tablist" aria-label="Sign-in method">
          {(Object.keys({ phone: 1, email: 1, google: 1 }) as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => {
                setMethod(m);
                setFormError(undefined);
              }}
              className="border-border bg-surface rounded-lg border p-4 text-left aria-selected:border-brand-strong"
            >
              <span className="font-medium">
                {m === 'phone'
                  ? t('continueWithPhone')
                  : m === 'email'
                    ? t('continueWithEmail')
                    : t('continueWithGoogle')}
              </span>
            </button>
          ))}

          {method === 'phone' && (
            <FieldShell id="auth-phone" label={t('phoneLabel')} hint={t('phoneHint')}>
              {(describedBy) => (
                <Input
                  id="auth-phone"
                  aria-describedby={describedBy}
                  type="tel"
                  autoComplete="tel"
                  placeholder="+234 801 234 5678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              )}
            </FieldShell>
          )}
          {method === 'email' && (
            <FieldShell id="auth-email" label={t('emailLabel')} hint={t('emailHint')}>
              {(describedBy) => (
                <Input
                  id="auth-email"
                  aria-describedby={describedBy}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              )}
            </FieldShell>
          )}
          {method === 'google' &&
            (providers.google ? (
              <Button
                fullWidth
                onClick={() => {
                  void signIn.social({ provider: 'google', callbackURL: next ?? '/onboarding' });
                }}
              >
                {t('continueWithGoogle')}
              </Button>
            ) : (
              <p className="text-muted text-sm">{t('googleUnavailable')}</p>
            ))}
          {formError && (
            <p role="alert" className="text-danger text-sm">
              {formError}
            </p>
          )}
        </div>
      )}

      {step === 'code' && (
        <div className="flex flex-col gap-4">
          {locked ? (
            <div role="alert" className="border-danger bg-danger-soft rounded-lg border p-4">
              <p className="font-medium">{t('lockedTitle')}</p>
              <p className="text-sm">{t('lockedBody')}</p>
            </div>
          ) : (
            <OtpInput
              id="auth-code"
              label={t('codeLabel')}
              value={code}
              onChange={setCode}
              onComplete={(value) => void verify(value)}
              error={formError}
            />
          )}
          <p className="text-muted text-sm">{t('codeHint')}</p>
          <Button
            variant="ghost"
            disabled={cooldown > 0 || sending}
            onClick={() => {
              void sendCode();
            }}
          >
            {cooldown > 0 ? t('resendIn', { seconds: cooldown }) : t('resendCode')}
          </Button>
          {formError && !locked && (
            <p role="alert" className="text-danger text-sm">
              {formError}
            </p>
          )}
        </div>
      )}

      {step === 'sent-link' && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium">{t('checkEmailTitle')}</p>
          <p className="text-muted text-base">{t('checkEmailBody', { email })}</p>
        </div>
      )}
    </GuestShell>
  );
}
