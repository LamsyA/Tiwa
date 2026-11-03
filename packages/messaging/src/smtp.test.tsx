/** @jsxRuntime automatic @jsxImportSource react */
import { describe, expect, it } from 'vitest';
import { SmtpEmail } from './smtp.js';

describe('SmtpEmail (D-X56)', () => {
  it('skips placeholder addresses without connecting', async () => {
    // Unreachable host: any real send attempt would throw.
    const smtp = new SmtpEmail({ host: '127.0.0.1', port: 1, user: 'u', password: 'p', from: 'Tiwa <t@x.test>' });
    const result = await smtp.send({ to: '2348038283661@phone.tiwa.local', subject: 'Hi', react: <p>Hello</p> });
    expect(result.id).toBe('skipped-placeholder');
  });
});
