import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DateText, MoneyText, RelativeTime } from './format.js';

describe('MoneyText', () => {
  it('formats minor units with the Intl narrow symbol', () => {
    render(<MoneyText value="2500000" currency="NGN" locale="en-NG" />);
    expect(screen.getByText('₦25,000.00')).toBeInTheDocument();
  });

  it('accepts bigint and zero-decimal currencies', () => {
    render(<MoneyText value={1500n} currency="JPY" locale="en" />);
    expect(screen.getByText('¥1,500')).toBeInTheDocument();
  });
});

describe('DateText', () => {
  it('renders the event timezone, not the viewer one', () => {
    // 2026-12-24T23:30:00Z is already Christmas Day in Lagos (UTC+1).
    render(<DateText value="2026-12-24T23:30:00.000Z" timeZone="Africa/Lagos" locale="en" />);
    expect(screen.getByText(/Dec 25, 2026/)).toBeInTheDocument();
  });

  it('keeps a machine-readable datetime', () => {
    render(<DateText value="2026-12-24T23:30:00.000Z" format="datetime" timeZone="UTC" locale="en" />);
    expect(screen.getByRole('time')).toHaveAttribute('datetime', '2026-12-24T23:30:00.000Z');
  });
});

describe('RelativeTime', () => {
  const now = new Date('2026-11-04T12:00:00.000Z');

  it('says ago for the past and tomorrow for next day', () => {
    render(<RelativeTime value="2026-11-04T09:00:00.000Z" now={now} locale="en" />);
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
  });

  it('says tomorrow with numeric auto', () => {
    render(<RelativeTime value="2026-11-05T12:00:00.000Z" now={now} locale="en" />);
    expect(screen.getByText('tomorrow')).toBeInTheDocument();
  });
});
