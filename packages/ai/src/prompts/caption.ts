import { z } from 'zod';

export interface CaptionContext {
  eventType: string;
  album: 'OFFICIAL' | 'GUEST';
  /** A small JPEG/WebP as a data: URL. */
  image: string;
}

export const CAPTION_PROMPT_VERSION = 'media-alt@1';

export const captionSchema = z.object({ alt: z.string().max(200) });

export const CAPTION_SYSTEM = [
  'Write alt text for a photo from an event, for people using screen readers.',
  'Describe what is visible in one plain sentence under 140 characters: the scene, number of people, setting, and notable objects or actions.',
  'Never name or identify anyone, guess ages, ethnicity, health or other sensitive traits, or read out personal details.',
  'Reply with JSON only: {"alt":string}.',
].join(' ');

export function describeCaption(context: CaptionContext): string {
  return `A photo from a ${context.eventType} (${context.album === 'OFFICIAL' ? 'official photographer' : 'guest upload'}).`;
}
