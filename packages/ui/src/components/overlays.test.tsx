import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, ResponsiveDialog } from './dialog.js';
import { DropdownMenu, Popover } from './menu.js';
import { ToastProvider, useToast } from './toast.js';
import { Tooltip } from './tooltip.js';
import { Button } from './button.js';

describe('ResponsiveDialog', () => {
  it('opens from a trigger and closes', async () => {
    const user = userEvent.setup();
    render(
      <ResponsiveDialog trigger={<button type="button">Open</button>} title="Details">
        <p>Body text</p>
      </ResponsiveDialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ConfirmDialog gates destructive confirm behind typed text', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        trigger={<button type="button">Delete</button>}
        title="Delete event?"
        body={<p>This cannot be undone.</p>}
        confirmLabel="Delete forever"
        requireText="DELETE"
        onConfirm={onConfirm}
        destructive
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/Type DELETE to confirm/), 'DELETE');
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('DropdownMenu', () => {
  it('opens and selects with mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<DropdownMenu trigger={<button type="button">Actions</button>} items={[{ label: 'Rename', onSelect }]} />);
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('Popover', () => {
  it('toggles content', async () => {
    const user = userEvent.setup();
    render(
      <Popover trigger={<button type="button">Info</button>}>
        <p>Popover body</p>
      </Popover>,
    );
    expect(screen.queryByText('Popover body')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Info' }));
    expect(screen.getByText('Popover body')).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('shows on hover and focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="More info">
        <button type="button">Hover me</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'Hover me' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('More info');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Toast', () => {
  function Harness({ tone }: { tone: 'success' | 'error' }) {
    const push = useToast();
    return <Button onClick={() => push({ title: 'Saved', description: 'All good', tone })}>Show</Button>;
  }

  it('announces success politely and errors assertively', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Harness tone="success" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Saved');
  });

  it('throws outside a provider', () => {
    function Bad() {
      useToast();
      return null;
    }
    expect(() => render(<Bad />)).toThrow('useToast must be used under <ToastProvider>');
  });
});
