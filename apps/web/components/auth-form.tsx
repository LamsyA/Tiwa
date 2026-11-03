'use client';

import { Button, FieldShell, Input, cn } from '@tiwa/ui';
import { ArrowRight, Mail, Smartphone } from 'lucide-react';
import Link from 'next/link';
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

  const [method, setMethod] = React.useState<Method>('email');
  const [step, setStep] = React.useState<Step>('method');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>(undefined);
  const [locked, setLocked] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  // Phone and Google show as "Coming soon" until the server says they are live (D-X48).
  const [providers, setProviders] = React.useState<{ phone: boolean; google: boolean }>({
    phone: false,
    google: false,
  });
  const soon = (m: Method) => (m === 'phone' && !providers.phone) || (m === 'google' && !providers.google);

  React.useEffect(() => {
    void fetch('/api/auth/providers')
      .then((response) => response.json())
      .then((data: unknown) => {
        if (typeof data === 'object' && data !== null) {
          const live = data as { phone?: unknown; google?: unknown };
          setProviders({ phone: Boolean(live.phone), google: Boolean(live.google) });
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
      const result = await postJson('/api/auth/magic-link/send', { email, ...(next ? { next } : {}) });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setStep('sent-link');
    } finally {
      setSending(false);
    }
  }

  const primary =
    step === 'method' ? (
      method === 'phone' && !soon('phone') ? (
        <Button fullWidth size="lg" loading={sending} onClick={() => void sendCode()} className="rounded-xl">
          {t('sendCode')}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : method === 'email' ? (
        <Button fullWidth size="lg" loading={sending} onClick={() => void sendLink()} className="rounded-xl">
          {t('sendLink')}
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      ) : undefined
    ) : step === 'code' ? (
      <Button
        fullWidth
        size="lg"
        loading={verifying}
        disabled={locked}
        onClick={() => void verify()}
        className="rounded-xl"
      >
        {t('verify')}
      </Button>
    ) : undefined;

  return (
    <div data-frame="guest" className="flex flex-col">
      <h1 className="font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
        {mode === 'signup' ? t('signupTitle') : t('loginTitle')}
      </h1>
      <p className="text-muted mt-2 mb-8 text-base">{mode === 'signup' ? t('signupSubtitle') : t('loginSubtitle')}</p>

      {step === 'method' && (
        <div className="flex flex-col gap-4" role="tablist" aria-label="Sign-in method">
          {(Object.keys({ phone: 1, email: 1, google: 1 }) as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              disabled={soon(m)}
              onClick={() => {
                setMethod(m);
                setFormError(undefined);
              }}
              className={cn(
                'border-border bg-bg flex items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                'hover:border-text/25 aria-selected:border-brand-strong aria-selected:bg-brand-soft/40 aria-selected:ring-brand-strong/20 aria-selected:ring-4',
                'disabled:hover:border-border disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <span className="bg-surface-2 text-text grid size-9 shrink-0 place-items-center rounded-lg">
                {m === 'phone' ? (
                  <Smartphone className="size-4" aria-hidden />
                ) : m === 'email' ? (
                  <Mail className="size-4" aria-hidden />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                    />
                  </svg>
                )}
              </span>
              <span className="font-medium">
                {m === 'phone'
                  ? t('continueWithPhone')
                  : m === 'email'
                    ? t('continueWithEmail')
                    : t('continueWithGoogle')}
              </span>
              {soon(m) && (
                <span className="bg-surface-2 text-muted ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold">
                  {t('comingSoon')}
                </span>
              )}
            </button>
          ))}

          {method === 'phone' && !soon('phone') && (
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
        </div>
      )}

      {step === 'sent-link' && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium">{t('checkEmailTitle')}</p>
          <p className="text-muted text-base">{t('checkEmailBody', { email })}</p>
        </div>
      )}
      {primary && <div className="mt-6">{primary}</div>}

      <p className="text-muted mt-8 text-center text-sm">
        {mode === 'signup' ? t('haveAccount') : t('noAccount')}{' '}
        <Link
          href={`${mode === 'signup' ? '/login' : '/signup'}${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-text font-medium underline-offset-4 hover:underline"
        >
          {mode === 'signup' ? t('loginLink') : t('signupLink')}
        </Link>
      </p>
    </div>
  );
}
