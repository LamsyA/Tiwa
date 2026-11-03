/** @jsxRuntime automatic @jsxImportSource react */
import { describe, expect, it } from 'vitest';
import { renderSignInEmail } from './sign-in.js';

const props = {
  url: 'https://tiwa.app/api/auth/magic-link/verify?token=abc123',
  email: 'ada@example.com',
  appUrl: 'https://tiwa.app',
  expiresInMinutes: 15,
};

describe('sign-in email (D-X49)', () => {
  it('renders the link twice (button + fallback), expiry and safety note, with a text part', async () => {
    const { subject, html, text } = await renderSignInEmail(props);
    expect(subject).toBe('Your Tiwa sign-in link');
    expect(html.split('token=abc123').length - 1).toBeGreaterThanOrEqual(2);
    expect(html).toContain('15 minutes');
    expect(html).toContain('ada@example.com');
    expect(text).toContain('token=abc123');
    expect(text).not.toContain('<');
  });

  it('greets new accounts', async () => {
    const { subject, html } = await renderSignInEmail({ ...props, isNewAccount: true });
    expect(subject).toBe('Finish creating your Tiwa account');
    expect(html).toContain('Welcome to Tiwa');
  });

  it('D-X51: renders the password-reset variant', async () => {
    const { subject, html } = await renderSignInEmail({ ...props, expiresInMinutes: 60, purpose: 'reset' });
    expect(subject).toBe('Reset your Tiwa password');
    expect(html).toContain('Choose a new password');
    expect(html).toContain('60 minutes');
  });
});
