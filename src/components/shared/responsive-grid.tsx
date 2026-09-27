import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type GridProps = { className?: string; children: ReactNode };

/**
 * KPI row: 2 columns on phones (dense tiles), 4 on xl; `count={5}` gives 5 on 2xl, `count={3}` caps at 3.
 */
export function KpiGrid({ count = 4, className, children }: GridProps & { count?: 3 | 4 | 5 | 6 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:gap-4',
        count === 3 && 'lg:grid-cols-3',
        count === 4 && 'xl:grid-cols-4',
        count === 5 && 'lg:grid-cols-3 2xl:grid-cols-5',
        count === 6 && 'lg:grid-cols-3 2xl:grid-cols-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card grid for widgets/settings tiles: 1 → 2 (md) → 3 (xl). */
export function CardGrid({ columns = 3, className, children }: GridProps & { columns?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-4',
        columns === 2 && 'lg:grid-cols-2',
        columns === 3 && 'md:grid-cols-2 xl:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Main + side column (details pages): stacks below lg; side is ~340px at the logical end. */
export function SplitLayout({
  main,
  side,
  sideWidth = 'md',
  className,
}: {
  main: ReactNode;
  side: ReactNode;
  sideWidth?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 items-start gap-4 lg:gap-5',
        sideWidth === 'sm' && 'lg:grid-cols-[minmax(0,1fr)_18rem]',
        sideWidth === 'md' && 'lg:grid-cols-[minmax(0,1fr)_21rem]',
        sideWidth === 'lg' && 'lg:grid-cols-[minmax(0,1fr)_24rem]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 lg:gap-5">{main}</div>
      <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--spacing-header)+1rem)] lg:gap-5">{side}</aside>
    </div>
  );
}

/** Vertical page stack with the standard 20px rhythm. */
export function PageStack({ className, children }: GridProps) {
  return <div className={cn('flex min-w-0 flex-col gap-5', className)}>{children}</div>;
}
