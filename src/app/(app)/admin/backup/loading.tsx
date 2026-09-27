import { useTranslations } from 'next-intl';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

export default function BackupLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <KpiGrid>
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </KpiGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-lg border border-border bg-card p-5 shadow-card">
          <Skeleton className="mb-2 h-5 w-48" />
          <Skeleton className="mb-5 h-4 w-96 max-w-full" />
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-card">
          <Skeleton className="mb-4 h-5 w-40" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="mb-3 h-10" />
          ))}
        </div>
      </div>
      <Skeleton className="h-56 rounded-lg" />
    </div>
  );
}
