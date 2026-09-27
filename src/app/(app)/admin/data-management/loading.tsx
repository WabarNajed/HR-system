import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DataManagementLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <KpiGrid>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </KpiGrid>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-lg" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="mb-4 flex gap-4">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <DataTableSkeleton columns={7} rows={6} />
      </div>
    </div>
  );
}
