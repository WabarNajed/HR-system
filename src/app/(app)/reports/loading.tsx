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
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-44" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: g === 0 ? 7 : 4 }).map((_, i) => (
              <div key={i} className="flex min-h-[9.5rem] flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
                <div className="flex gap-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
                <Skeleton className="mt-auto h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
