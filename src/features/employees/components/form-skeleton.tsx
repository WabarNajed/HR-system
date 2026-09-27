import { Skeleton } from '@/components/ui/skeleton';

/** Employee form placeholder: section index + two field sections + sticky footer area. */
export function EmployeeFormSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-form flex-col gap-5" role="status" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-6">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-36" />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {[6, 8].map((n, s) => (
            <div key={s} className="rounded-lg border border-border bg-card shadow-card">
              <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
                <Skeleton className="size-7 rounded-md" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
                {Array.from({ length: n }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
