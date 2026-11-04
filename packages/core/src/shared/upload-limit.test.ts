import { describe, expect, it } from 'vitest';
import { capUpload, UPLOAD_MAX_BYTES } from './upload-limit.js';

describe('capUpload', () => {
  it('never lets a feature limit exceed the app-wide ceiling', () => {
    expect(UPLOAD_MAX_BYTES).toBe(1024 * 1024);
    expect(capUpload(200 * 1024 * 1024)).toBe(UPLOAD_MAX_BYTES);
    expect(capUpload(500 * 1024)).toBe(500 * 1024);
  });
});
