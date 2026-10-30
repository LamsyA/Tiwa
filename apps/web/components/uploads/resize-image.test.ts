import { describe, expect, it } from 'vitest';
import {
  resizedFileName,
  resizeImageForUpload,
  RESIZE_MAX_SIDE,
  RESIZE_QUALITY,
  supportsClientResize,
} from './resize-image.js';

describe('resizeImageForUpload', () => {
  it('leaves non-image files untouched', async () => {
    const blob = new Blob(['%PDF-1.4 hello'], { type: 'application/pdf' });
    const result = await resizeImageForUpload(blob, 'application/pdf');
    expect(result).toEqual({ blob, resized: false });
  });

  it('falls back to the original when the browser cannot resize (jsdom has no Workers/canvas)', async () => {
    expect(supportsClientResize()).toBe(false);
    const blob = new Blob(['fake-bytes'], { type: 'image/jpeg' });
    const result = await resizeImageForUpload(blob, 'image/jpeg');
    expect(result.blob).toBe(blob);
    expect(result.resized).toBe(false);
  });

  it('keeps defaults and sanitises output names', () => {
    expect(RESIZE_MAX_SIDE).toBe(2560);
    expect(RESIZE_QUALITY).toBe(0.82);
    expect(resizedFileName('IMG_1.HEIC')).toBe('IMG_1.webp');
    expect(resizedFileName('no-extension')).toBe('no-extension.webp');
    expect(resizedFileName('a.jpeg')).toBe('a.webp');
  });
});
