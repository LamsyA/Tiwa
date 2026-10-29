'use client';

import { Banner, Button, Card, ConfirmDialog, FieldShell, Input, SegmentedControl, Select } from '@tiwa/ui';
import type { ThemeChoice } from '@tiwa/ui/theme';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { deleteAccount, exportMyData, saveProfile, saveTheme } from './actions.js';

function applyTheme(choice: ThemeChoice) {
  const resolved =
    choice === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
  document.documentElement.setAttribute('data-theme', resolved);
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <section aria-labelledby={id} className="flex flex-col gap-4">
        <h2 id={id} className="font-display text-lg font-bold">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

export function SettingsForms({
  name: initialName,
  locale,
  theme: initialTheme,
}: {
  name: string;
  locale: 'en';
  theme: ThemeChoice;
}) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [theme, setTheme] = React.useState<ThemeChoice>(initialTheme);
  const [saving, setSaving] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | undefined>();
  const [profileNote, setProfileNote] = React.useState<string | undefined>();
  const [exportNote, setExportNote] = React.useState<string | undefined>();
  const [exporting, setExporting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | undefined>();

  async function submitProfile() {
    setNameError(undefined);
    setProfileNote(undefined);
    setSaving(true);
    try {
      const result = await saveProfile({ name, locale });
      if (result.ok) {
        setProfileNote(t('saved'));
        router.refresh();
      } else {
        const key = result.fieldErrors?.name?.[0];
        setNameError(t(`errors.${key === 'nameTooShort' || key === 'nameTooLong' ? key : 'generic'}`));
      }
    } catch {
      setNameError(t('errors.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function changeTheme(value: string) {
    if (value !== 'light' && value !== 'dark' && value !== 'system') return;
    setTheme(value);
    applyTheme(value);
    await saveTheme({ theme: value });
  }

  async function requestExport() {
    setExporting(true);
    try {
      const result = await exportMyData({});
      setExportNote(result.ok ? t(result.data.repeat ? 'exportRepeat' : 'exportQueued') : t('errors.generic'));
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    setDeleteError(undefined);
    const result = await deleteAccount({ confirm: true });
    if (result.ok) {
      router.replace('/');
      router.refresh();
      return;
    }
    setDeleteError(t(`errors.${result.code === 'CONFLICT' ? 'soleOwner' : 'generic'}`));
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <Section id="profile-heading" title={t('profileHeading')}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submitProfile();
          }}
        >
          <FieldShell id="settings-name" label={t('nameLabel')} error={nameError}>
            {(describedBy) => (
              <Input
                id="settings-name"
                aria-describedby={describedBy}
                aria-invalid={Boolean(nameError)}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FieldShell>
          <Select
            label={t('languageLabel')}
            value={locale}
            options={[{ value: 'en', label: t('languageEn') }]}
            onValueChange={() => undefined}
          />
          <p className="text-muted -mt-2 text-sm">{t('languageHint')}</p>
          {profileNote && (
            <p role="status" className="text-success text-sm">
              {profileNote}
            </p>
          )}
          <div>
            <Button type="submit" loading={saving}>
              {t('save')}
            </Button>
          </div>
        </form>
      </Section>

      <Section id="appearance-heading" title={t('appearanceHeading')}>
        <SegmentedControl
          ariaLabel={t('themeLabel')}
          value={theme}
          onValueChange={(value) => void changeTheme(value)}
          options={[
            { value: 'system', label: t('themeSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
          ]}
        />
      </Section>

      <Section id="notifications-heading" title={t('notificationsHeading')}>
        <p className="text-muted text-sm">{t('notificationsBody')}</p>
      </Section>

      <Section id="data-heading" title={t('dataHeading')}>
        <p className="text-muted text-sm">{t('exportBody')}</p>
        {exportNote && <Banner tone="info">{exportNote}</Banner>}
        <div>
          <Button variant="secondary" loading={exporting} onClick={() => void requestExport()}>
            {t('exportAction')}
          </Button>
        </div>
      </Section>

      <Section id="delete-heading" title={t('deleteHeading')}>
        <p className="text-muted text-sm">{t('deleteBody')}</p>
        {deleteError && <Banner tone="danger">{deleteError}</Banner>}
        <div>
          <ConfirmDialog
            destructive
            trigger={<Button variant="destructive">{t('deleteAction')}</Button>}
            title={t('deleteTitle')}
            body={t('deleteConfirmBody')}
            requireText={t('deleteWord')}
            confirmLabel={t('deleteAction')}
            onConfirm={() => void confirmDelete()}
          />
        </div>
      </Section>
    </div>
  );
}
