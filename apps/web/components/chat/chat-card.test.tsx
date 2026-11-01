import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import { ChatCard } from './chat-card.js';

// P7-T12: timeline cards render their snapshot without extra reads.
function renderCard(card: Parameters<typeof ChatCard>[0]['card']) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ChatCard card={card} />
    </NextIntlClientProvider>,
  );
}

describe('ChatCard', () => {
  it('renders a quote card with vendor and total', () => {
    renderCard({ type: 'quote', id: 'q', vendorName: 'Ada Catering', totalMinor: '15000000', currency: 'NGN' });
    expect(screen.getByText(/Ada Catering/)).toBeInTheDocument();
    expect(screen.getByText(/150,000/)).toBeInTheDocument();
  });

  it('renders a change card with version and diff', () => {
    renderCard({ type: 'change', id: 'v', version: 2, diffMinor: '15000000', currency: 'NGN' });
    expect(screen.getByText(/Change request v2/)).toBeInTheDocument();
  });

  it('renders a site visit card with the confirmed date', () => {
    renderCard({ type: 'site_visit', id: 's', date: '2027-03-10T10:00:00.000Z' });
    expect(screen.getByText(/Site visit confirmed/)).toBeInTheDocument();
  });
});
