'use client';

import { Progress as ProgressPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type ProgressProps = ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Tone of the indicator. */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** Indeterminate animation when `value` is null/undefined. */
  indeterminate?: boolean;
  indicatorClassName?: string;
};

const toneClass = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
} as const;

function Progress({ className, value, tone = 'primary', indeterminate, indicatorClassName, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={indeterminate ? null : value}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full rounded-full transition-[width] duration-300 ease-out',
          toneClass[tone],
          indeterminate && 'w-full origin-[0%_50%] animate-progress-indeterminate rtl:origin-[100%_50%] rtl:[animation-direction:reverse]',
          indicatorClassName,
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
