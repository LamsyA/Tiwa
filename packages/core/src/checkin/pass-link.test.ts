import { describe, expect, it } from 'vitest';
import { passCode, passEventId, passLink } from './checkin.js';

const EVENT = '01a1e84e-3e1f-7aa1-9e95-b70e4496be7e';
const CODE = `checkin:01a1e84e-0000-7aa1-9e95-b70e4496be7e:${EVENT}:1999999999999:abc123`;

describe('pass links (D-X91)', () => {
  it('round-trips a code through a link any camera can open', () => {
    const link = passLink('https://tiwa.app/', CODE);
    expect(link.startsWith('https://tiwa.app/k/')).toBe(true);
    expect(passCode(link)).toBe(CODE);
  });

  it('leaves a bare code alone and ignores query strings', () => {
    expect(passCode(`  ${CODE} `)).toBe(CODE);
    expect(passCode(`${passLink('https://tiwa.app', CODE)}?utm=x`)).toBe(CODE);
  });

  it('reads the event from ticket and invitation codes only', () => {
    expect(passEventId(CODE)).toBe(EVENT);
    expect(passEventId(CODE.replace('checkin:', 'ticket:'))).toBe(EVENT);
    expect(passEventId('hello:a:b:c:d')).toBeNull();
    expect(passEventId('not a code')).toBeNull();
  });
});
