'use client';

import { Button } from '@tiwa/ui';
import { Download } from 'lucide-react';
import * as React from 'react';

/** "Save as PDF" through the browser's print dialog; opens it once on load when asked. */
export function PrintButton({ label, auto = false }: { label: string; auto?: boolean }) {
  React.useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [auto]);
  return (
    <Button className="rounded-full print:hidden" onClick={() => window.print()}>
      <Download aria-hidden className="size-4" />
      {label}
    </Button>
  );
}
