import Link from 'next/link';
import type * as React from 'react';
import { PrintButton } from './print-button.js';

/** Chrome-free page that prints as a clean A4 PDF (D-X47). */
export function PrintShell({
  backHref,
  backLabel,
  printLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  printLabel: string;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-bg text-text mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={backHref} className="text-brand-strong flex-1 text-sm font-semibold hover:underline">
          ← {backLabel}
        </Link>
        <PrintButton label={printLabel} auto />
      </div>
      {children}
    </main>
  );
}
