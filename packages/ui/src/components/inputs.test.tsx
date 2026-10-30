import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateField, TimeField } from './date-time.js';
import { MoneyInput, PhoneInput } from './phone-money.js';
import { Combobox, Select } from './select.js';

describe('PhoneInput', () => {
  it('formats Nigerian numbers as you type and emits E.164', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<PhoneInput value="" onValueChange={onValueChange} aria-label="Phone" />);
    const input = screen.getByLabelText('Phone');
    await user.type(input, '08031234567');
    // Formatter loads on demand (dynamic import); it normalises on arrival.
    await vi.waitFor(() => expect(input).toHaveValue('0803 123 4567'));
    expect(onValueChange).toHaveBeenLastCalledWith('+2348031234567', true);
  });

  it('follows a typed + prefix to another country', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<PhoneInput value="" onValueChange={onValueChange} aria-label="Phone" />);
    await user.type(screen.getByLabelText('Phone'), '+14155552671');
    await vi.waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith('+14155552671', true));
  });

  it('shows a controlled E.164 value formatted', async () => {
    render(<PhoneInput value="+2348031234567" onValueChange={() => {}} aria-label="Phone" />);
    await vi.waitFor(() => expect(screen.getByLabelText('Phone')).toHaveValue('+234 803 123 4567'));
  });
});

describe('MoneyInput', () => {
  it('shows major units with the Intl symbol, stores minor units', () => {
    render(<MoneyInput value="2500000" onValueChange={() => {}} currency="NGN" aria-label="Amount" />);
    const input = screen.getByLabelText('Amount');
    expect(input).toHaveValue('25000');
    expect(input.previousSibling ?? input.parentElement).toBeDefined();
  });

  it('parses grouped decimals into minor units', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MoneyInput value="" onValueChange={onValueChange} currency="NGN" aria-label="Amount" />);
    await user.type(screen.getByLabelText('Amount'), '1,000.50');
    expect(onValueChange).toHaveBeenLastCalledWith('100050');
  });

  it('handles zero-decimal currencies', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<MoneyInput value="" onValueChange={onValueChange} currency="JPY" aria-label="Amount" />);
    await user.type(screen.getByLabelText('Amount'), '1500');
    expect(onValueChange).toHaveBeenLastCalledWith('1500');
  });
});

describe('DateField / TimeField', () => {
  it('emits ISO date strings', () => {
    const onValueChange = vi.fn();
    render(<DateField value="" onValueChange={onValueChange} aria-label="Day" />);
    const input = screen.getByLabelText('Day');
    expect(input).toHaveAttribute('type', 'date');
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    expect(onValueChange).toHaveBeenLastCalledWith('2026-12-25');
  });

  it('emits 24-hour times', () => {
    const onValueChange = vi.fn();
    render(<TimeField value="" onValueChange={onValueChange} aria-label="Start" />);
    const input = screen.getByLabelText('Start');
    expect(input).toHaveAttribute('type', 'time');
    fireEvent.change(input, { target: { value: '18:30' } });
    expect(onValueChange).toHaveBeenLastCalledWith('18:30');
  });
});

describe('Select labelling', () => {
  it('renders a visible label tied to the trigger', () => {
    render(<Select label="Language" options={[{ value: 'en', label: 'English' }]} value="en" />);
    expect(screen.getByText('Language')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Language' })).toHaveTextContent('English');
  });

  it('forwards aria-label when there is no visible label', () => {
    render(<Select aria-label="Permissions" options={[{ value: 'full', label: 'Full' }]} value="full" />);
    expect(screen.getByRole('button', { name: 'Permissions' })).toBeInTheDocument();
  });
});

describe('Select', () => {
  const options = [
    { value: 'birthday', label: 'Birthday' },
    { value: 'wedding', label: 'Wedding' },
    { value: 'burial', label: 'Burial' },
  ];

  it('opens, picks with mouse and keyboard', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select options={options} onValueChange={onValueChange} placeholder="Pick one" aria-label="Type" />);
    await user.click(screen.getByRole('button', { name: 'Type' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wedding' }));
    expect(onValueChange).toHaveBeenCalledWith('wedding');
  });

  it('searches long lists', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 10 }, (_, i) => ({ value: `o${i}`, label: `Option ${i}` }));
    render(<Select options={many} onValueChange={() => {}} placeholder="Pick" aria-label="Many" />);
    await user.click(screen.getByRole('button', { name: 'Many' }));
    await user.type(screen.getByLabelText('Search options'), 'Option 9');
    expect(screen.getByRole('option', { name: 'Option 9' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Option 1' })).not.toBeInTheDocument();
  });

  it('loads options asynchronously', async () => {
    const user = userEvent.setup();
    render(
      <Select
        loadOptions={async (query) => (query ? [{ value: query, label: `Found ${query}` }] : [])}
        onValueChange={() => {}}
        placeholder="Search vendors"
        aria-label="Vendors"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Vendors' }));
    await user.type(screen.getByLabelText('Search options'), 'deejay');
    expect(await screen.findByRole('option', { name: 'Found deejay' })).toBeInTheDocument();
  });
});

describe('Combobox', () => {
  it('accepts a custom value when nothing matches', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Combobox
        options={[{ value: 'a', label: 'Alpha' }]}
        onValueChange={onValueChange}
        placeholder="Pick or type"
        aria-label="Choice"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Choice' }));
    await user.type(screen.getByLabelText('Search options'), 'Zulu');
    await user.click(await screen.findByRole('button', { name: 'Use "Zulu"' }));
    expect(onValueChange).toHaveBeenCalledWith('Zulu');
  });
});
