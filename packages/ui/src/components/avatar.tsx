'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '../lib/cn.js';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export type AvatarSize = 'sm' | 'md' | 'lg';

const avatarSizes: Record<AvatarSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
};

export interface AvatarProps {
  name: string;
  src?: string | undefined;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'bg-surface-2 text-text inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium',
        avatarSizes[size],
        className,
      )}
    >
      {src && <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback delayMs={200}>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarGroup({
  avatars,
  max = 4,
  size = 'md',
  className,
}: {
  avatars: Array<{ name: string; src?: string }>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = avatars.slice(0, max);
  const extra = avatars.length - shown.length;
  return (
    <div className={cn('flex -space-x-2', className)} role="group" aria-label={`${avatars.length} people`}>
      {shown.map((avatar) => (
        <Avatar key={avatar.name} name={avatar.name} src={avatar.src} size={size} className="border-bg border-2" />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            'bg-surface-2 text-muted border-bg inline-flex shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium',
            avatarSizes[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
