import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Loading placeholder with a subtle shimmer (respects reduced motion). */
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...props} />;
}

export { Skeleton };
