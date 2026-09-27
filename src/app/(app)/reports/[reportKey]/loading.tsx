import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

/** Report skeleton: header, filter bar, KPI row, chart card and table. */
export default function ReportLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-11 rounded-lg" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-96 max-w-[70vw]" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-card">
        <Skeleton className="h-4 w-16" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <KpiGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </KpiGrid>
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <Skeleton className="h-5 w-48" />
        <div className="mt-5 flex h-52 items-end gap-3">
          {[40, 65, 50, 80, 55, 70, 45, 90, 60, 75, 50, 68].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <DataTableSkeleton columns={7} rows={8} avatar />
    </div>
  );
}
