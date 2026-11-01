'use client';

import { Button } from '@tiwa/ui';

export function PrintButton({ label }: { label: string }) {
  return (
    <Button className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
