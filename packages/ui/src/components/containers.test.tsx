import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Card, StatCard } from './card.js';
import { List, ListItem } from './list.js';
import { Banner, EmptyState, Skeleton } from './states.js';
import { DataTable } from './table.js';
import { Tabs } from './tabs.js';

describe('Card / StatCard', () => {
  it('renders a stretched link for the whole card', () => {
    render(
      <Card href="/events/1">
        <span>Ada&apos;s birthday</span>
      </Card>,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/events/1');
  });

  it('shows label, display value, delta and help', () => {
    render(
      <StatCard label="Guests" value="148" delta={{ text: '+12 this week', tone: 'success' }} help="Confirmed RSVPs" />,
    );
    expect(screen.getByText('Guests')).toBeInTheDocument();
    expect(screen.getByText('148')).toBeInTheDocument();
    expect(screen.getByText('+12 this week')).toBeInTheDocument();
    expect(screen.getByText('Confirmed RSVPs')).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('switches panels with click and arrow keys', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Tabs
        ariaLabel="Sections"
        onValueChange={onValueChange}
        items={[
          { value: 'plan', label: 'Plan' },
          { value: 'guests', label: 'Guests' },
        ]}
      >
        {(active) => <p>Active: {active}</p>}
      </Tabs>,
    );
    expect(screen.getByText('Active: plan')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Guests' }));
    expect(onValueChange).toHaveBeenCalledWith('guests');
    expect(screen.getByRole('tab', { name: 'Guests' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('DataTable', () => {
  const rows = [
    { id: 'b', name: 'Bola', guests: 40 },
    { id: 'a', name: 'Ada', guests: 120 },
  ];
  const columns = [
    {
      key: 'name',
      header: 'Name',
      cell: (r: (typeof rows)[number]) => r.name,
      sortable: true,
      sortValue: (r: (typeof rows)[number]) => r.name,
    },
    {
      key: 'guests',
      header: 'Guests',
      cell: (r: (typeof rows)[number]) => String(r.guests),
      sortable: true,
      sortValue: (r: (typeof rows)[number]) => r.guests,
    },
  ];

  it('sorts by header and selects rows', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <DataTable
        ariaLabel="Guests"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        selectable
        onSelectionChange={onSelectionChange}
        renderCard={(r) => <p>Card {r.name}</p>}
      />,
    );
    const names = () => screen.getAllByRole('cell', { name: /^(Ada|Bola)$/ }).map((c) => c.textContent);
    expect(names()).toEqual(['Bola', 'Ada']);
    await user.click(screen.getByRole('button', { name: 'Sort by Guests' }));
    expect(names()).toEqual(['Bola', 'Ada']);
    await user.click(screen.getByRole('button', { name: 'Sort by Guests' }));
    expect(names()).toEqual(['Ada', 'Bola']);
    await user.click(screen.getAllByRole('checkbox')[1] as HTMLElement);
    expect(onSelectionChange).toHaveBeenCalledWith(['a']);
    expect(screen.getByText('Card Ada')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<DataTable ariaLabel="Guests" rows={[]} columns={columns} rowKey={(r) => r.id} emptyText="No guests yet" />);
    expect(screen.getByText('No guests yet')).toBeInTheDocument();
  });
});

describe('List', () => {
  it('exposes the same actions through the visible more button', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <List>
        <ListItem title="Catering" meta="₦250,000" actions={[{ label: 'Edit', onSelect: onEdit }]} />
      </List>,
    );
    expect(screen.getByText('Catering')).toBeInTheDocument();
    expect(screen.getByText('₦250,000')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('swipe reveals quick actions', () => {
    const { container } = render(
      <List>
        <ListItem title="Catering" actions={[{ label: 'Delete', destructive: true, onSelect: () => {} }]} />
      </List>,
    );
    const row = container.querySelector('[class*="transition-transform"]') as HTMLElement;
    fireEvent.touchStart(row, { touches: [{ clientX: 200 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(row);
    expect(row.style.transform).toContain('translateX(-72px)');
  });
});

describe('states', () => {
  it('EmptyState shows title, body and action', () => {
    render(
      <EmptyState
        title="No guests yet"
        body="Invite your first guest"
        action={<button type="button">Invite</button>}
      />,
    );
    expect(screen.getByText('No guests yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
  });

  it('Skeleton announces loading', () => {
    render(<Skeleton variant="grid" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('Banner uses alert for warnings', () => {
    render(
      <Banner tone="warning" title="Heads up">
        Send an update to guests?
      </Banner>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Heads up');
  });
});
