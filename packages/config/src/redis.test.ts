import { describe, expect, it } from 'vitest';
import { redisTls } from './redis.js';

describe('redisTls (D-X57)', () => {
  it('sends the hostname as TLS servername for rediss:// URLs', () => {
    expect(redisTls('rediss://default:secret@tiwa-db.sage.cloud.layerbase.dev:6379')).toEqual({
      tls: { servername: 'tiwa-db.sage.cloud.layerbase.dev' },
    });
  });

  it('adds nothing for plain redis:// or bad URLs', () => {
    expect(redisTls('redis://localhost:6379')).toEqual({});
    expect(redisTls('not a url')).toEqual({});
  });
});
