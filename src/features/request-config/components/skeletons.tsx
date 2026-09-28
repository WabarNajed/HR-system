import { useTranslations } from 'next-intl';
import { DataTableSkeleton } from '@/components/data-table';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCardSkeleton } from '@/components/shared/stat-card';
import { Skeleton } from '@/components/ui/skeleton';

function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
    </div>
  );
}

/** Header · KPI row · table (Request types, SLA, Email templates). */
export function TablePageSkeleton({ kpis = 4, columns = 6, rows = 8, extra = false }: { kpis?: 0 | 3 | 4; columns?: number; rows?: number; extra?: boolean }) {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <HeaderSkeleton />
      {kpis ? (
        <KpiGrid count={kpis}>
          {Array.from({ length: kpis }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </KpiGrid>
      ) : null}
      {extra ? <Skeleton className="h-28 w-full rounded-xl" /> : null}
      <DataTableSkeleton columns={columns} rows={rows} filters={2} />
    </div>
  );
}

/** Builder pages: header + (rail · canvas · properties). */
export function BuilderSkeleton() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <HeaderSkeleton actions={2} />
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)_18rem]">
        <div className="hidden flex-col gap-2 rounded-lg border border-border bg-card p-3 lg:flex">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
        <div className="hidden flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex">
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
