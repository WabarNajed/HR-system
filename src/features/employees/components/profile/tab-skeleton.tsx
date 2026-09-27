import { Skeleton } from '@/components/ui/skeleton';

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2.5">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: rows * 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Profile tab placeholder (main column + side column). */
export function TabSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-5" aria-busy="true">
      <div className="flex flex-col gap-4 lg:gap-5">
        <CardSkeleton rows={2} />
        <CardSkeleton rows={1} />
      </div>
      <div className="flex flex-col gap-4 lg:gap-5">
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="mt-4 flex items-center gap-3">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Profile header placeholder (cover band, avatar, name, meta, tabs). */
export function ProfileHeaderSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="h-16 bg-muted sm:h-20" />
      <div className="px-4 sm:px-6">
        <div className="-mt-10 flex flex-col gap-3 sm:-mt-12 sm:flex-row sm:items-start sm:gap-4">
          <Skeleton className="size-20 rounded-full ring-4 ring-card sm:size-24" />
          <div className="flex-1 space-y-2 sm:pt-14">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
      <div className="mt-4 flex gap-4 px-4 pb-3 sm:px-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
    </div>
  );
}
