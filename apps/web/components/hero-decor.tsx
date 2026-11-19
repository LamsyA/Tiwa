import { TiwaMark, cn } from '@tiwa/ui';

/**
 * Shared look for coloured hero cards (Today redesign, applied app-wide).
 * HERO_GRADIENT is the brand-red → stone gradient; HeroDecor adds the warm
 * gold glow and, on wider screens, the canopy mark as a faint watermark.
 * The parent needs `relative isolate overflow-hidden`.
 */
export const HERO_GRADIENT =
  'bg-[linear-gradient(140deg,color-mix(in_oklab,var(--brand-strong)_92%,black)_0%,color-mix(in_oklab,var(--brand-strong)_55%,#1c1917)_55%,#1c1917_100%)]';

export const HERO_SHADOW = 'shadow-[0_24px_60px_-28px_rgb(0_0_0/0.55)]';

export function HeroDecor({
  mark = true,
  markSize = 200,
  className,
}: {
  mark?: boolean;
  markSize?: number;
  className?: string;
}) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-28 -right-20 -z-10 size-80 rounded-full bg-[#f2b705]/20 blur-3xl',
          className,
        )}
      />
      {mark && (
        <TiwaMark
          size={markSize}
          className="pointer-events-none absolute -right-4 -bottom-10 -z-10 hidden text-white/[0.06] sm:block"
        />
      )}
    </>
  );
}
