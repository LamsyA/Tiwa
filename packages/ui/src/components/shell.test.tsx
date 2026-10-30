import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GuestShell } from './guest-shell.js';
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
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('renders page content, section tabs and actions exactly once (no duplicate forms or ids)', () => {
    render(
      <AppShell
        role="host"
        active="home"
        title="Home"
        actions={<button type="button">Search</button>}
        sectionTabs={<a href="#a">Tab A</a>}
      >
        <form>
          <input id="only-once" aria-label="Field" />
        </form>
      </AppShell>,
    );
    expect(document.querySelectorAll('#only-once')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Tab A' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Search' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1, name: 'Home' })).toHaveLength(1);
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
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New booking' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(container.textContent).toContain('Details');
  });
});

describe('GuestShell', () => {
  it('renders cover, sticky action and footer mark without app chrome', () => {
    render(
      <GuestShell
        title="You're invited"
        coverAlt="Party lights"
        action={<button type="button">RSVP now</button>}
        footerNote="Private event"
      >
        <p>Saturday, 4pm</p>
      </GuestShell>,
    );
    const frame = document.querySelector('[data-frame="guest"]') as HTMLElement;
    expect(frame).toHaveClass('max-w-[560px]');
    expect(within(frame).getByRole('heading', { name: "You're invited" })).toBeInTheDocument();
    expect(within(frame).getByRole('img', { name: 'Party lights' })).toBeInTheDocument();
    expect(within(frame).getByRole('button', { name: 'RSVP now' })).toBeInTheDocument();
    expect(within(frame).getByText('Tiwa')).toBeInTheDocument();
    expect(within(frame).queryByRole('navigation')).not.toBeInTheDocument();
  });
});
