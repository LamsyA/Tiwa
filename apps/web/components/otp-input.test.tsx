import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OtpInput } from './otp-input.js';

function setup(onComplete = vi.fn(), start = '') {
  const onChange = vi.fn();
  let value = start;
  function handleChange(next: string) {
    value = next;
    onChange(next);
    rerenderUi();
  }
  let rerenderUi = () => {};
  const { rerender } = render(<OtpInput label="Code" value={value} onChange={handleChange} onComplete={onComplete} />);
  rerenderUi = () => rerender(<OtpInput label="Code" value={value} onChange={handleChange} onComplete={onComplete} />);
  const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];
  return { boxes, onChange, onComplete };
}

describe('OtpInput', () => {
  it('auto-advances and auto-submits on 6 digits', async () => {
    const user = userEvent.setup();
    const { boxes, onComplete } = setup();
    expect(boxes()).toHaveLength(6);
    await user.type(boxes()[0] as HTMLElement, '123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(document.activeElement).toBe(boxes()[5]);
  });

  it('distributes a pasted code', () => {
    const { boxes, onComplete } = setup();
    fireEvent.paste(
      boxes()[0] as HTMLElement,
      {
        clipboardData: { getData: () => '654321' },
      } as unknown as ClipboardEvent,
    );
    expect(
      boxes()
        .map((box) => box.value)
        .join(''),
    ).toBe('654321');
    expect(onComplete).toHaveBeenCalledWith('654321');
  });

  it('backspace moves to the previous box', async () => {
    const user = userEvent.setup();
    const { boxes } = setup(vi.fn(), '12');
    boxes()[2]!.focus();
    await user.keyboard('{Backspace}');
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('ignores non-digits', async () => {
    const user = userEvent.setup();
    const { boxes, onChange } = setup();
    await user.type(boxes()[0] as HTMLElement, 'ab1');
    expect(onChange).toHaveBeenLastCalledWith('1');
  });
});
