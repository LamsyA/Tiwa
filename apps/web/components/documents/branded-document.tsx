import { DateText, MoneyText, StatusPill } from '@tiwa/ui';
import type * as React from 'react';

export interface BrandedLine {
  label: string;
  qty: number;
  unitMinor: string;
}

/**
 * Branded proposal / invoice (D-X47): the business's logo (or monogram),
 * name and city on top, an itemised table, and the total. Used on screen and
 * on the chrome-free print pages that become the PDF.
 */
export function BrandedDocument({
  org,
  kindLabel,
  heading,
  status,
  parties,
  lines,
  currency,
  totalMinor,
  notes,
  labels,
}: {
  org: { id: string; name: string; city: string | null; hasLogo: boolean };
  kindLabel: string;
  heading: string;
  status?: { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' | 'brand' } | undefined;
  parties: { label: string; value: React.ReactNode; sub?: string | null | undefined }[];
  lines: BrandedLine[];
  currency: string;
  totalMinor: string;
  notes?: string | null | undefined;
  labels: { item: string; qty: string; unit: string; amount: string; total: string };
}) {
  const initials = org.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return (
    <article className="border-border/70 bg-surface relative overflow-hidden rounded-3xl border shadow-[var(--shadow-1)] print:rounded-none print:border-0 print:shadow-none">
      <div
        aria-hidden
        className="h-1.5 bg-[linear-gradient(90deg,var(--brand),var(--accent))] print:[print-color-adjust:exact]"
      />
      <div className="flex flex-col gap-7 p-5 sm:p-9">
        <header className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-center gap-4">
            {org.hasLogo ? (
              <img
                src={`/api/org-logo/${org.id}`}
                alt={org.name}
                className="border-border/60 size-14 rounded-2xl border bg-white object-contain p-1"
              />
            ) : (
              <span className="font-display grid size-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,var(--brand),var(--brand-strong))] text-lg font-bold text-white print:[print-color-adjust:exact]">
                {initials}
              </span>
            )}
            <div>
              <p className="font-display text-lg leading-tight font-bold">{org.name}</p>
              {org.city && <p className="text-muted text-sm">{org.city}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-muted text-xs font-semibold tracking-[0.2em] uppercase">{kindLabel}</p>
            <h1 className="font-display text-2xl font-bold tracking-tight">{heading}</h1>
            {status && (
              <div className="mt-1 print:hidden">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </div>
            )}
          </div>
        </header>

        <dl className="bg-surface-2/60 grid gap-4 rounded-2xl p-4 text-sm sm:grid-cols-3">
          {parties.map((party) => (
            <div key={party.label}>
              <dt className="text-muted text-xs font-medium">{party.label}</dt>
              <dd className="mt-0.5 font-semibold">{party.value}</dd>
              {party.sub && <dd className="text-muted text-xs">{party.sub}</dd>}
            </div>
          ))}
        </dl>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-border/70 border-b text-left text-xs">
              <th className="py-2.5 font-medium">{labels.item}</th>
              <th className="py-2.5 text-right font-medium">{labels.qty}</th>
              <th className="hidden py-2.5 text-right font-medium sm:table-cell print:table-cell">{labels.unit}</th>
              <th className="py-2.5 text-right font-medium">{labels.amount}</th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {lines.map((line, index) => (
              <tr key={index} className="break-inside-avoid">
                <td className="py-3 pr-3">{line.label}</td>
                <td className="py-3 text-right tabular-nums">{line.qty}</td>
                <td className="hidden py-3 text-right tabular-nums sm:table-cell print:table-cell">
                  <MoneyText value={line.unitMinor} currency={currency} />
                </td>
                <td className="py-3 text-right font-medium tabular-nums">
                  <MoneyText value={(BigInt(line.qty) * BigInt(line.unitMinor)).toString()} currency={currency} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center justify-between rounded-2xl bg-[linear-gradient(135deg,color-mix(in_oklab,var(--brand-strong)_90%,black),#140b07)] px-5 py-4 text-white print:[print-color-adjust:exact]">
          <span className="text-sm font-medium text-white/80">{labels.total}</span>
          <MoneyText value={totalMinor} currency={currency} className="font-display text-2xl font-bold" />
        </div>
        {notes && <p className="text-muted text-sm leading-relaxed whitespace-pre-line">{notes}</p>}
        <p className="text-muted/70 border-border/60 border-t pt-4 text-center text-[11px]">
          {org.name} · <DateText value={new Date()} format="date" />
        </p>
      </div>
    </article>
  );
}
