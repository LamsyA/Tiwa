'use client';

import * as React from 'react';

/**
 * Subscribe to a live SSE stream (D-A06). Calls `onChange` on every change
 * notice; if the stream can't be held open (proxy, offline, server down) it
 * falls back to polling every `pollMs`, so updates still land within ~10 s
 * (UF-05-3). Pauses while the tab is hidden.
 */
export function useLive(url: string, onChange: () => void, pollMs = 10_000): void {
  const handler = React.useRef(onChange);
  React.useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        if (document.visibilityState === 'visible') handler.current();
      }, pollMs);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      source = new EventSource(url, { withCredentials: true });
      source.addEventListener('change', () => handler.current());
      source.addEventListener('ready', stopPolling);
      source.onerror = () => {
        // EventSource retries by itself; poll meanwhile so nothing is missed.
        if (!disposed) startPolling();
      };
    }

    return () => {
      disposed = true;
      source?.close();
      stopPolling();
    };
  }, [url, pollMs]);
}
