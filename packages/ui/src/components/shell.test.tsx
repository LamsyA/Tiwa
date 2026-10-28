import { render, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell, navigationForRole } from './shell.js';

describe('navigationForRole', () => {
  it('gives hosts, planners and vendors different destinations', () => {
    expect(navigationForRole('host').tabs.map((t) => t.key)).toEqual(['home', 'events', 'inbox', 'money', 'more']);
    expect(navigationForRole('vendor').tabs.map((t) => t.key)).toContain('bookings');
    expect(navigationForRole('planner').sidebar.map((t) => t.key)).toContain('pipeline');
    expect(navigationForRole('host').sidebar.map((t) => t.key)).not.toContain('pipeline');
  });
});

describe('AppShell', () => {
  it('renders mobile tabs with the active page marked', () => {
    render(
      <AppShell role="host" active="inbox" title="Inbox">
        <p>Body</p>
      </AppShell>,
    );
    const mobile = document.querySelector('[data-frame="mobile"]') as HTMLElement;
    const inbox = within(mobile).getByRole('link', { name: 'Inbox' });
    expect(inbox).toHaveAttribute('aria-current', 'page');
    expect(within(mobile).getByText('Body')).toBeInTheDocument();
  });

  it('renders the sticky action and section tabs slots', () => {
    render(
      <AppShell
        role="vendor"
        active="home"
        title="Home"
        sectionTabs={<button type="button">Overview</button>}
        stickyAction={<button type="button">New booking</button>}
      >
        <p>Body</p>
      </AppShell>,
    );
    const mobile = document.querySelector('[data-frame="mobile"]') as HTMLElement;
    expect(within(mobile).getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(within(mobile).getByRole('button', { name: 'New booking' })).toBeInTheDocument();
  });

  it('collapses and expands the desktop sidebar', async () => {
    const user = userEvent.setup();
    render(
      <AppShell role="planner" active="events" title="Events">
        <p>Body</p>
      </AppShell>,
    );
    const desktop = document.querySelector('[data-frame="desktop"]') as HTMLElement;
    await user.click(within(desktop).getByRole('button', { name: 'Collapse sidebar' }));
    expect(within(desktop).getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
  });

  it('shows the back button and detail panel when provided', () => {
    const { container } = render(
      <AppShell role="host" active="events" title="Ada at 40" onBack={() => {}} sidePanel={<p>Details</p>}>
        <p>Body</p>
      </AppShell>,
    );
    const mobile = document.querySelector('[data-frame="mobile"]') as HTMLElement;
    expect(within(mobile).getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(container.textContent).toContain('Details');
  });
});
