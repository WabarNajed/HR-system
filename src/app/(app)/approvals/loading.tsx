import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

/** Approvals skeleton: header, KPI row, tabs and the queue table. */
export default function ApprovalsLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <KpiGrid>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </KpiGrid>
      <div className="flex gap-4 border-b border-border pb-2.5">
        {[24, 20, 20].map((w, i) => (
          <Skeleton key={i} className="h-5" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <DataTableSkeleton columns={7} rows={6} />
    </div>
  );
}
