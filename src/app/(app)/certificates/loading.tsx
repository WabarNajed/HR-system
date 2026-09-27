import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

/** Certificate Center skeleton: header, KPI strip, tabs and the table. */
export default function CertificatesLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
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
      <div className="flex gap-6 border-b border-border pb-2.5">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
      <DataTableSkeleton columns={7} rows={8} avatar />
    </div>
  );
}
