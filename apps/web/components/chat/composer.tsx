'use client';

import { IconButton, Textarea } from '@tiwa/ui';
import { Paperclip, SendHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

const TYPING_EVERY_MS = 3000;

/**
 * Message composer pinned above the keyboard (Frontend.md §6.3). Enter sends
 * (Shift+Enter for a new line); typing pings the server at most every 3 s.
 */
export function Composer({
  onSend,
  onTyping,
  onAttach,
  disabled,
  initial = '',
}: {
  onSend: (body: string) => void;
  onTyping?: () => void;
  /** Photos and files (lean chat attachments, D-X20). */
  onAttach?: (files: File[]) => void;
  disabled?: boolean;
  initial?: string;
}) {
  const t = useTranslations('inbox');
  const [body, setBody] = React.useState(initial);
  const lastPing = React.useRef(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  // Keep the composer visible above the on-screen keyboard (iOS visualViewport).
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => ref.current?.scrollIntoView({ block: 'nearest' });
    viewport.addEventListener('resize', onResize);
    return () => viewport.removeEventListener('resize', onResize);
  }, []);

  function submit() {
    const text = body.trim();
    if (!text || disabled) return;
    onSend(text);
    setBody('');
  }

  return (
    <form
      className="flex items-end gap-2 bg-[var(--chat-panel)] px-3 py-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {onAttach && (
        <>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,.pdf,.docx,.xlsx,.pptx"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) onAttach(files.slice(0, 10));
              event.target.value = '';
            }}
          />
          <IconButton
            type="button"
            variant="ghost"
            label={t('attach')}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip aria-hidden className="size-5" />
          </IconButton>
        </>
      )}
      <Textarea
        ref={ref}
        aria-label={t('composerLabel')}
        placeholder={t('composerPlaceholder')}
        rows={1}
        maxLength={4000}
        disabled={disabled}
        className="bg-bg max-h-40 min-h-11 flex-1 resize-none rounded-3xl border-transparent px-4 py-2.5 shadow-none focus:border-transparent focus:ring-0"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          const now = Date.now();
          if (onTyping && now - lastPing.current > TYPING_EVERY_MS) {
            lastPing.current = now;
            onTyping();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="submit"
        aria-label={t('send')}
        disabled={disabled || !body.trim()}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--chat-accent)] text-white shadow-1 transition-transform hover:brightness-105 active:scale-95 disabled:opacity-40"
      >
        <SendHorizontal aria-hidden className="size-5" />
      </button>
    </form>
  );
}
