import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlagsProvider, useFlag } from './flags.js';

function Probe() {
  return <span>{useFlag('ai.enabled') ? 'on' : 'off'}</span>;
}

const ALL_OFF = { 'payments.held': false, 'payments.payouts': false, 'whatsapp.bulk': false, 'ai.enabled': false };

describe('useFlag', () => {
  it('reads resolved flags from the provider', () => {
    render(
      <FlagsProvider flags={{ ...ALL_OFF, 'ai.enabled': true }}>
        <Probe />
      </FlagsProvider>,
    );
    expect(screen.getByText('on')).toBeInTheDocument();
  });

  it('is OFF without a provider (fail closed)', () => {
    render(<Probe />);
    expect(screen.getByText('off')).toBeInTheDocument();
  });
});
