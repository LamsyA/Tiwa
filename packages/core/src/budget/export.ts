// Budget CSV export (P9-T06, UF-20 step 4). Pure: the caller passes
// translated headers and line labels, so no English lives here. Amounts are
// plain decimals in major units (2 dp, or 0 for zero-decimal currencies) so
// spreadsheets sum them. Cells that start with = + - @ are prefixed with '
// to stop formula injection (Backend.md §12).

export interface BudgetCsvText {
  headers: [string, string, string, string, string, string, string];
  sections: { line: string; booking: string; expense: string; income: string };
  otherLabel: string;
  incomeKind: (kind: string) => string;
}

function digitsFor(currency: string): number {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function minorToDecimal(minor: bigint, digits: number): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  if (digits === 0) return `${negative ? '-' : ''}${abs}`;
  const scale = 10n ** BigInt(digits);
  return `${negative ? '-' : ''}${abs / scale}.${(abs % scale).toString().padStart(digits, '0')}`;
}

export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface BudgetCsvInput {
  lines: {
    label: string | null;
    plannedMinor: bigint;
    committedMinor: bigint;
    paidMinor: bigint;
    outstandingMinor: bigint;
    bookings: { vendorName: string; committedMinor: bigint | null; paidMinor: bigint | null }[];
    expenses: { description: string; amountMinor: bigint; paid: boolean }[];
  }[];
  income: { kind: string; pledgedMinor: bigint; receivedMinor: bigint }[];
}

export function budgetCsv(summary: BudgetCsvInput, currency: string, text: BudgetCsvText): string {
  const digits = digitsFor(currency);
  // Hidden vendor amounts (EVT-12) export as empty cells; aggregates stay.
  const amount = (value: bigint | null) => (value == null ? '' : minorToDecimal(value, digits));
  const rows: string[][] = [text.headers];
  for (const line of summary.lines) {
    const label = line.label ?? text.otherLabel;
    rows.push([
      text.sections.line,
      label,
      amount(line.plannedMinor),
      amount(line.committedMinor),
      amount(line.paidMinor),
      amount(line.outstandingMinor),
      currency,
    ]);
    for (const booking of line.bookings) {
      const outstanding =
        booking.committedMinor == null || booking.paidMinor == null
          ? null
          : booking.committedMinor - booking.paidMinor;
      rows.push([
        text.sections.booking,
        `${label}: ${booking.vendorName}`,
        '',
        amount(booking.committedMinor),
        amount(booking.paidMinor),
        amount(outstanding),
        currency,
      ]);
    }
    for (const expense of line.expenses) {
      const paid = expense.paid ? expense.amountMinor : 0n;
      rows.push([
        text.sections.expense,
        `${label}: ${expense.description}`,
        '',
        amount(expense.amountMinor),
        amount(paid),
        amount(expense.amountMinor - paid),
        currency,
      ]);
    }
  }
  for (const row of summary.income) {
    rows.push([
      text.sections.income,
      text.incomeKind(row.kind),
      amount(row.pledgedMinor),
      '',
      amount(row.receivedMinor),
      amount(row.pledgedMinor - row.receivedMinor),
      currency,
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
