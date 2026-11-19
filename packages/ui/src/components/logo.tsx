import { cn } from '../lib/cn.js';

// D-X99: the Tiwa mark (C2 "the canopy, one line"). One even stroke draws the
// canopy every celebration gathers under; its pole curls forward like a hand
// held out; a gold star is the spark of the day. The stroke uses
// currentColor, so callers colour it with a text class; the star stays gold.

const CANOPY =
  'M16 46 C22 27 36 19 50 19 C64 19 78 27 84 46 Q75.5 56 67 46 Q58.5 56 50 46 Q41.5 56 33 46 Q24.5 56 16 46';
const POLE = 'M50 46 V71 Q50 86 65 86 H71';
const STAR = 'M50 0 C51 5 53 7 58 8 C53 9 51 11 50 16 C49 11 47 9 42 8 C47 7 49 5 50 0 Z';

export interface TiwaMarkProps {
  /** Pixel size of the square mark. */
  size?: number;
  className?: string;
  /** Accessible name; omit when a wordmark sits beside it. */
  title?: string;
}

export function TiwaMark({ size = 32, className, title }: TiwaMarkProps) {
  // Thicker line at small sizes so the canopy never turns to hairline.
  const stroke = size <= 20 ? 11 : size <= 32 ? 9 : 7.5;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('text-brand-strong shrink-0', className)}
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <path
        d={CANOPY}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={POLE}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {size > 20 && <path d={STAR} fill="#f2b705" />}
    </svg>
  );
}

export interface TiwaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** `light` for dark or photo backgrounds. */
  tone?: 'default' | 'light';
  className?: string;
  /** The product name as configured (defaults to "tiwa"). */
  name?: string;
}

const SIZES = {
  sm: { mark: 22, text: 'text-lg', gap: 'gap-1.5' },
  md: { mark: 28, text: 'text-[22px]', gap: 'gap-2' },
  lg: { mark: 36, text: 'text-3xl', gap: 'gap-2.5' },
} as const;

/** Mark + lowercase serif wordmark, the way the brand board shows it. */
export function TiwaLogo({ size = 'md', tone = 'default', className, name = 'tiwa' }: TiwaLogoProps) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      <TiwaMark size={s.mark} {...(tone === 'light' ? { className: 'text-white' } : {})} />
      <span
        style={{ fontFamily: 'var(--font-brand), Georgia, "Times New Roman", serif' }}
        className={cn(
          'leading-none font-semibold tracking-[-0.02em] lowercase',
          s.text,
          tone === 'light' ? 'text-white' : 'text-text',
        )}
      >
        {name}
      </span>
    </span>
  );
}
