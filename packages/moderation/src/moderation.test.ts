import { describe, expect, it } from 'vitest';
import { createModerationProvider, FakeModeration } from './index.js';

describe('createModerationProvider', () => {
  it('builds the Fake and rejects unknown providers loudly', () => {
    expect(createModerationProvider('fake')).toBeInstanceOf(FakeModeration);
    expect(() => createModerationProvider('rekognition')).toThrow(/unsupported moderation provider/);
  });
});

describe('FakeModeration', () => {
  it('approves by default and records scans', async () => {
    const mod = new FakeModeration();
    const result = await mod.scan({ key: 'g/a.jpg', mime: 'image/jpeg', sizeBytes: 1000, kind: 'PHOTO' });
    expect(result).toEqual({ verdict: 'APPROVE', labels: [] });
    expect(mod.scanned).toHaveLength(1);
    mod.clear();
    expect(mod.scanned).toEqual([]);
  });

  it('honours injected decisions for review/block paths', async () => {
    const mod = new FakeModeration((input) => (input.key.includes('block') ? 'BLOCK' : 'REVIEW'));
    expect((await mod.scan({ key: 'x/block-me.jpg', mime: 'image/jpeg', sizeBytes: 10, kind: 'PHOTO' })).verdict).toBe(
      'BLOCK',
    );
    expect((await mod.scan({ key: 'x/ok.jpg', mime: 'image/jpeg', sizeBytes: 10, kind: 'PHOTO' })).verdict).toBe(
      'REVIEW',
    );
  });
});
