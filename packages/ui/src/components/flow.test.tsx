import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProgressBar, ProgressRing } from './progress.js';
import { Stepper } from './stepper.js';
import { Timeline } from './timeline.js';

describe('Stepper', () => {
  const steps = [{ label: 'Details' }, { label: 'Guests' }, { label: 'Review' }];

  it('marks done/current/todo and announces the compact position', () => {
    render(<Stepper steps={steps} active={1} ariaLabel="Create event" />);
    expect(screen.getByRole('navigation', { name: 'Create event' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    const current = screen.getByRole('button', { name: /Step 2 of 3: Guests \(current step\)/ });
    expect(current.closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('navigates back through completed steps when allowed', async () => {
    const user = userEvent.setup();
    const onStepClick = vi.fn();
    render(<Stepper steps={steps} active={2} onStepClick={onStepClick} />);
    await user.click(screen.getByRole('button', { name: /Step 1 of 3: Details \(completed\)/ }));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });
});

describe('Timeline', () => {
  it('renders items with a now-line divider', () => {
    render(
      <Timeline
        ariaLabel="Run of show"
        nowLabel="Now"
        nowAfter={0}
        items={[
          { time: '10:00', title: 'Gates open', tone: 'success' },
          { time: '11:00', title: 'Ceremony', body: 'Main hall', tone: 'brand' },
        ]}
      />,
    );
    expect(screen.getByRole('list', { name: 'Run of show' })).toBeInTheDocument();
    expect(screen.getByText('Ceremony')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
  });
});

describe('ProgressBar / ProgressRing', () => {
  it('exposes value semantics and clamps', () => {
    render(<ProgressBar label="Uploading" value={150} max={100} showValue />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('ring shows the percentage', () => {
    render(<ProgressRing label="Budget used" value={30} />);
    expect(screen.getByRole('progressbar', { name: 'Budget used' })).toHaveAttribute('aria-valuenow', '30');
    expect(screen.getByText('30%')).toBeInTheDocument();
  });
});
