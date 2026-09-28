import { useTranslations } from 'next-intl';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

/** Report Center skeleton: header, highlight KPIs, search row and report cards. */
export default function ReportsLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <KpiGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </KpiGrid>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Skeleton className="h-9 w-full lg:w-96" />
        <Skeleton className="h-9 w-full lg:ms-auto lg:w-[34rem]" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {[
          [7, 4],
          [2, 6, 1],
        ].map((panels, c) => (
          <div key={c} className="flex flex-col gap-4">
            {panels.map((rows, p) => (
              <div key={p} className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
                <div className="flex items-center gap-2.5 border-b border-border bg-subtle/60 px-4 py-2.5">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="divide-y divide-border">
                  {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="size-9 shrink-0 rounded-lg" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-4 w-2/5" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                      <Skeleton className="hidden h-8 w-16 sm:block" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
