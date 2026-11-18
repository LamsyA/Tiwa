'use client';

import { Button, FieldShell, Input } from '@tiwa/ui';
import { Mail, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { saveBusinessContact } from './contact-actions.js';

/**
 * D-X90: business phone and email. As a gate (`required`) it stands in for
 * the page until both are saved; on Business profile it edits them in place.
 */
export function BusinessContactForm({
  orgId,
  name,
  phone: initialPhone,
  email: initialEmail,
  required = false,
}: {
  orgId: string;
  name: string;
  phone: string | null;
  email: string | null;
  required?: boolean;
}) {
  const t = useTranslations('contactGate');
  const te = useTranslations('onboarding');
  const router = useRouter();
  const [phone, setPhone] = React.useState(initialPhone ?? '');
  const [email, setEmail] = React.useState(initialEmail ?? '');
  const [errors, setErrors] = React.useState<{ phone?: string | undefined; email?: string | undefined; form?: string }>(
    {},
  );
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaved(false);
    setSaving(true);
    const result = await saveBusinessContact({ orgId, phone, email }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
    const fields = result && !result.ok ? result.fieldErrors : undefined;
    if (fields) {
      setErrors({
        phone: fields.phone?.[0] ? te(`errors.${fields.phone[0]}`) : undefined,
        email: fields.email?.[0] ? te(`errors.${fields.email[0]}`) : undefined,
      });
    } else {
      setErrors({ form: te('errors.generic') });
    }
  }

  return (
    <section
      className={`border-border/70 bg-surface flex flex-col gap-4 rounded-3xl border p-5 sm:p-6 ${
        required ? 'mx-auto my-6 w-full max-w-lg shadow-[var(--shadow-2)]' : ''
      }`}
      aria-labelledby="business-contact-title"
    >
      <div className="flex flex-col gap-1">
        {required && (
          <span className="text-brand-strong text-xs font-semibold tracking-wide uppercase">{t('eyebrow')}</span>
        )}
        <h2 id="business-contact-title" className="font-display text-xl font-bold tracking-tight">
          {required ? t('title') : t('editTitle')}
        </h2>
        <p className="text-muted text-sm">{required ? t('body', { name }) : t('editBody')}</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <FieldShell id="contact-phone" label={te('phoneLabel')} error={errors.phone}>
          {(describedBy) => (
            <div className="relative">
              <Phone
                aria-hidden
                className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="contact-phone"
                type="tel"
                required
                className="pl-9"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.phone)}
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
          )}
        </FieldShell>
        <FieldShell id="contact-email" label={te('emailLabel')} error={errors.email}>
          {(describedBy) => (
            <div className="relative">
              <Mail
                aria-hidden
                className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              />
              <Input
                id="contact-email"
                type="email"
                required
                className="pl-9"
                aria-describedby={describedBy}
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          )}
        </FieldShell>
        {errors.form && (
          <p role="alert" className="text-danger text-sm">
            {errors.form}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving} className="rounded-full">
            {saving ? t('saving') : required ? t('save') : t('saveEdit')}
          </Button>
          {saved && !required && (
            <span role="status" className="text-success text-sm">
              {t('saved')}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
