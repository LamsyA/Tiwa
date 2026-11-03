'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as React from 'react';

interface Command {
  key: string;
  href: string;
}

const COMMANDS: Command[] = [
  { key: 'goHome', href: '/home' },
  { key: 'goEvents', href: '/events' },
  { key: 'newEvent', href: '/events/new' },
  { key: 'goClients', href: '/clients' },
  { key: 'goPipeline', href: '/clients?view=pipeline' },
  { key: 'goCalendar', href: '/calendar' },
  { key: 'goTeam', href: '/team' },
  { key: 'goVendorBook', href: '/vendor-book' },
  { key: 'goInvoices', href: '/invoices' },
  { key: 'goInbox', href: '/inbox' },
];

/**
 * Planner command palette (PLN, P10-T09): Cmd/Ctrl+K anywhere, type to
 * filter, arrows + Enter to go, Esc to close. Desktop-first: the trigger
 * button only shows on md+ screens, but the shortcut works everywhere.
 */
export function CommandPalette() {
  const t = useTranslations('planner');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function openPalette() {
    setQuery('');
    setActive(0);
    setOpen(true);
  }

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const labels = React.useMemo(() => COMMANDS.map((cmd) => ({ ...cmd, label: t(`commands.${cmd.key}`) })), [t]);
  const filtered = labels.filter((cmd) => cmd.label.toLowerCase().includes(query.trim().toLowerCase()));
  const current = filtered[Math.min(active, Math.max(filtered.length - 1, 0))];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="meta+k control+k"
        className="border-border text-muted hidden items-center gap-2 rounded-md border px-3 py-1.5 text-sm md:inline-flex"
      >
        {t('commandTrigger')}
        <kbd className="bg-surface-2 rounded px-1.5 py-0.5 text-xs">⌘K</kbd>
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('commandTitle')}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-bg w-full max-w-md overflow-hidden rounded-lg shadow-2"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive((index) => Math.min(index + 1, filtered.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter' && current) {
                  event.preventDefault();
                  go(current.href);
                }
              }}
              placeholder={t('commandPlaceholder')}
              aria-label={t('commandPlaceholder')}
              role="combobox"
              aria-expanded="true"
              aria-controls="cmd-list"
              aria-activedescendant={current ? `cmd-${current.key}` : undefined}
              className="border-border w-full border-b px-4 py-3 outline-none"
            />
            <ul id="cmd-list" role="listbox" className="max-h-64 overflow-auto p-1">
              {filtered.map((cmd, index) => (
                <li key={cmd.key} id={`cmd-${cmd.key}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    onClick={() => go(cmd.href)}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm ${
                      index === active ? 'bg-surface-2' : ''
                    }`}
                  >
                    {cmd.label}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="text-muted px-3 py-2 text-sm">{t('commandEmpty')}</li>}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
