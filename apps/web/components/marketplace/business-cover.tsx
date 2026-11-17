import { ImageOff } from 'lucide-react';

/**
 * A business's cover (D-X80): its own photo, or — when it has not uploaded any —
 * a branded placeholder with its initials. Never a stock picture: a stock photo
 * of "a venue" misleads hosts about what they are booking.
 */
export function BusinessCover({
  src,
  name,
  emptyLabel,
  className = '',
  eager = false,
}: {
  src: string | null;
  name: string;
  emptyLabel: string;
  className?: string;
  eager?: boolean;
}) {
  if (src) {
    return (
      // Plain img: these are signed/proxied routes, not static imports the image loader can size.
      <img
        src={src}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`size-full object-cover ${className}`}
      />
    );
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('') || '•';
  return (
    <div
      className={`relative flex size-full flex-col items-center justify-center gap-2 overflow-hidden bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--brand)_35%,transparent),transparent_60%),linear-gradient(135deg,var(--brand-strong),#3a1d12)] ${className}`}
    >
      <span className="font-display text-3xl font-bold tracking-tight text-white/90 sm:text-4xl">{initials}</span>
      <span className="flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
        <ImageOff aria-hidden className="size-3" />
        {emptyLabel}
      </span>
    </div>
  );
}

/** A business's logo (D-X81): the uploaded logo on white, else its initial on brand. */
export function BusinessLogo({
  src,
  name,
  className = 'size-9 rounded-xl',
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`shrink-0 bg-white object-contain p-1 shadow-[var(--shadow-1)] ring-1 ring-black/5 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`bg-brand-soft text-brand-strong grid shrink-0 place-items-center font-bold ${className}`}
    >
      {name.trim().charAt(0).toUpperCase() || '•'}
    </span>
  );
}
