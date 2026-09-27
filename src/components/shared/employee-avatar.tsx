'use client';

import type { CSSProperties } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials, hashString } from '@/lib/utils';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClass: Record<AvatarSize, string> = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-[0.6875rem]',
  md: 'size-9 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-16 text-lg',
};

/** Deterministic soft tint (from the chart palette) for a seed such as the employee id. */
export function avatarTint(seed: string): CSSProperties {
  const slot = (hashString(seed) % 8) + 1;
  return {
    backgroundColor: `color-mix(in oklab, var(--chart-${slot}) 15%, var(--card))`,
    color: `color-mix(in oklab, var(--chart-${slot}) 78%, var(--foreground))`,
  };
}

export type EmployeeAvatarProps = {
  /** Display name used for initials (already localized). */
  name: string;
  /** Stable seed for the tint (employee id); defaults to the name. */
  seed?: string;
  /** Signed/public image URL; falls back to initials while loading or on error. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Adds a ring (e.g. on colored headers). */
  ring?: boolean;
};

/** Employee avatar: photo when available, otherwise initials on a deterministic tint. */
export function EmployeeAvatar({ name, seed, src, size = 'md', className, ring }: EmployeeAvatarProps) {
  const initials = getInitials(name) || '•';
  return (
    <Avatar className={cn(sizeClass[size], ring && 'ring-2 ring-card', className)} data-slot="employee-avatar">
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback className="font-semibold tracking-wide" style={avatarTint(seed ?? name)} delayMs={src ? 400 : 0}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
