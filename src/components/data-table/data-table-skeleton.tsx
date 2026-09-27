import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type DataTableSkeletonProps = {
  columns?: number;
  rows?: number;
  /** Render the toolbar placeholder row (default true). */
  toolbar?: boolean;
  /** Number of filter button placeholders. */
  filters?: number;
  /** First column shows an avatar + two lines (employee lists). */
  avatar?: boolean;
  className?: string;
};

const widths = ['w-40', 'w-24', 'w-32', 'w-20', 'w-28', 'w-16', 'w-24', 'w-20'];

/** Loading placeholder matching DataTable's layout (use in loading.tsx / Suspense fallbacks). */
export function DataTableSkeleton({ columns = 6, rows = 10, toolbar = true, filters = 2, avatar = false, className }: DataTableSkeletonProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-busy="true" data-slot="data-table-skeleton">
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-full sm:w-72" />
          {Array.from({ length: filters }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
          <div className="ms-auto flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="flex h-10 items-center gap-6 border-b border-border bg-subtle px-4">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className={cn('h-3', i === 0 ? 'w-28' : 'w-16', i > 3 && 'hidden md:block')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex h-12 items-center gap-6 border-b border-border px-4 last:border-b-0">
            {Array.from({ length: columns }).map((_, c) =>
              c === 0 && avatar ? (
                <div key={c} className="flex w-48 shrink-0 items-center gap-2.5">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-20" />
                  </div>
                </div>
              ) : (
                <Skeleton key={c} className={cn('h-3', widths[(c + r) % widths.length], c > 3 && 'hidden md:block')} />
              ),
            )}
          </div>
        ))}
        <div className="flex h-12 items-center justify-between border-t border-border px-4">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-40" />
        </div>
      </div>
    </div>
  );
}
