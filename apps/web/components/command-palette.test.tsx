'use client';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from './command-palette.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const messages = {
  planner: {
    commandTitle: 'Commands',
    commandTrigger: 'Commands',
    commandPlaceholder: 'Type a command',
    commandEmpty: 'No matches',
    commands: {
      goHome: 'Go to Home',
      goEvents: 'Go to Events',
      newEvent: 'Create event',
      goClients: 'Go to Clients',
      goPipeline: 'Go to Pipeline',
      goCalendar: 'Go to Calendar',
      goTeam: 'Go to Team',
      goVendorBook: 'Go to Vendor book',
      goInvoices: 'Go to Invoices',
      goInbox: 'Go to Inbox',
    },
  },
};

function renderPalette() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CommandPalette />
    </NextIntlClientProvider>,
  );
}

describe('CommandPalette', () => {
  it('opens on Cmd+K and filters to one match', async () => {
    const user = userEvent.setup();
    renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.type(screen.getByRole('combobox'), 'inbox');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Go to Inbox');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.keyboard('{Meta>}k{/Meta}');
    expect(screen.getByRole('dialog')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
