import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { Skeleton } from '@/components/ui/skeleton';

/** Default skeleton for authenticated pages: header, KPI row and a table. */
export default function AppLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <KpiGrid>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </KpiGrid>
      <DataTableSkeleton columns={6} rows={8} />
    </div>
  );
}
