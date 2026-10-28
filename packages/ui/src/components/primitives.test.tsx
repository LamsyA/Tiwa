import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, AvatarGroup } from './avatar.js';
import { Button, IconButton } from './button.js';
import { Badge, Chip, ChipGroup, StatusPill } from './chip-badge.js';
import { FieldShell, Input, Textarea } from './input.js';
import { Label } from './label.js';
import { Checkbox, RadioGroup, RadioItem, SegmentedControl, Switch } from './toggles.js';

describe('Button', () => {
  it('renders variants and keeps width while loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button onClick={onClick} iconLeft={<span aria-hidden>i</span>}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toHaveClass('bg-brand-strong');
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button loading>Save</Button>);
    const loading = screen.getByRole('button', { name: /save/i });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toBeDisabled();
    expect(loading.textContent).toContain('Save');
    await user.click(loading);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('IconButton requires an accessible label', () => {
    render(
      <IconButton label="Close">
        <span aria-hidden>x</span>
      </IconButton>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('fields', () => {
  it('labels above, errors below with aria-describedby', () => {
    render(
      <FieldShell id="name" label="Event name" hint="Say something fun" error="Required">
        {(describedBy) => <Input id="name" aria-describedby={describedBy} error />}
      </FieldShell>,
    );
    expect(screen.getByLabelText('Event name')).toBeInTheDocument();
    const input = screen.getByLabelText('Event name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain('name-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.queryByText('Say something fun')).not.toBeInTheDocument();
  });

  it('Textarea renders with rows', () => {
    render(<Textarea id="notes" aria-label="Notes" />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('rows', '3');
  });

  it('Label links to its control', () => {
    render(
      <div>
        <Label htmlFor="city">City</Label>
        <Input id="city" />
      </div>,
    );
    expect(screen.getByLabelText('City')).toBeInTheDocument();
  });
});

describe('toggles', () => {
  it('Checkbox toggles with click and keyboard', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Remind me" />);
    const box = screen.getByRole('checkbox', { name: 'Remind me' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    await user.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    box.focus();
    await user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'false');
  });

  it('RadioGroup selects one option', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup aria-label="Visibility" defaultValue="private">
        <RadioItem value="private">Private</RadioItem>
        <RadioItem value="public">Public</RadioItem>
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Private' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Public' }));
    expect(screen.getByRole('radio', { name: 'Public' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Switch toggles', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Notifications" />);
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('SegmentedControl activates one option', async () => {
    const user = userEvent.setup();
    render(
      <SegmentedControl
        ariaLabel="View"
        defaultValue="list"
        options={[
          { value: 'list', label: 'List' },
          { value: 'grid', label: 'Grid' },
        ]}
      />,
    );
    const grid = screen.getByRole('radio', { name: 'Grid' });
    await user.click(grid);
    expect(grid).toHaveAttribute('aria-checked', 'true');
  });
});

describe('chip, badge, status', () => {
  it('Chip toggles pressed state and removes', async () => {
    const user = userEvent.setup();
    let removed = false;
    render(
      <ChipGroup label="Channels">
        <Chip selected={false}>WhatsApp</Chip>
        <Chip
          selected
          onRemove={() => {
            removed = true;
          }}
          removeLabel="Remove SMS"
        >
          SMS
        </Chip>
      </ChipGroup>,
    );
    const wa = screen.getByRole('button', { name: 'WhatsApp' });
    expect(wa).toHaveAttribute('aria-pressed', 'false');
    await user.click(wa);
    await user.click(screen.getByRole('button', { name: 'Remove SMS' }));
    expect(removed).toBe(true);
  });

  it('Badge and StatusPill render text, never colour alone', () => {
    render(
      <div>
        <Badge tone="success">12</Badge>
        <StatusPill tone="warning">Pending</StatusPill>
      </div>,
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});

describe('avatar', () => {
  it('falls back to initials with the name as alt context', async () => {
    render(<Avatar name="Adaeze Okafor" />);
    // Radix delays the fallback 200 ms to avoid flashing on fast loads.
    expect(await screen.findByText('AO')).toBeInTheDocument();
  });

  it('AvatarGroup caps and counts the rest', () => {
    render(
      <AvatarGroup avatars={[{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]} max={3} />,
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByLabelText('5 people')).toBeInTheDocument();
  });
});
