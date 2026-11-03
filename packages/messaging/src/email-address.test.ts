import { describe, expect, it } from 'vitest';
import { isDeliverableEmail, isPlaceholderEmail } from './email-address.js';

describe('placeholder emails (D-X56)', () => {
  it('recognises phone and username placeholders', () => {
    expect(isPlaceholderEmail('2348038283661@phone.tiwa.local')).toBe(true);
    expect(isPlaceholderEmail('ada.events@user.tiwa.local')).toBe(true);
    expect(isPlaceholderEmail('Ada@Phone.Tiwa.Local ')).toBe(true);
  });

  it('also skips reserved test domains that can never receive mail', () => {
    expect(isPlaceholderEmail('door-x@example.test')).toBe(true);
    expect(isPlaceholderEmail('a@example.com')).toBe(true);
    expect(isPlaceholderEmail('a@mail.localhost')).toBe(true);
    expect(isPlaceholderEmail('a@tiwa.ng')).toBe(false);
  });

  it('lets real addresses through', () => {
    expect(isPlaceholderEmail('ada@gmail.com')).toBe(false);
    expect(isDeliverableEmail('ada@gmail.com')).toBe(true);
    expect(isDeliverableEmail('2348038283661@phone.tiwa.local')).toBe(false);
    expect(isDeliverableEmail('')).toBe(false);
    expect(isDeliverableEmail(null)).toBe(false);
  });
});
