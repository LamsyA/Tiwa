'use client';

import { IconButton, Textarea } from '@tiwa/ui';
import { SendHorizontal } from 'lucide-react';
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
  disabled,
  initial = '',
}: {
  onSend: (body: string) => void;
  onTyping?: () => void;
  disabled?: boolean;
  initial?: string;
}) {
  const t = useTranslations('inbox');
  const [body, setBody] = React.useState(initial);
  const lastPing = React.useRef(0);
  const ref = React.useRef<HTMLTextAreaElement>(null);

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
      className="border-border bg-bg flex items-end gap-2 border-t p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        ref={ref}
        aria-label={t('composerLabel')}
        placeholder={t('composerPlaceholder')}
        rows={1}
        maxLength={4000}
        disabled={disabled}
        className="max-h-40 min-h-11 flex-1 resize-none"
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
      <IconButton type="submit" label={t('send')} disabled={disabled || !body.trim()}>
        <SendHorizontal aria-hidden className="size-5" />
      </IconButton>
    </form>
  );
}
