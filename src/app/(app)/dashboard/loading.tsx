import { useTranslations } from 'next-intl';
import { WidgetSkeleton } from '@/features/dashboard/components/widget-parts';
import { KpiRowSkeleton } from '@/features/dashboard/widgets/employee-kpis';
import { Skeleton } from '@/components/ui/skeleton';

/** Dashboard skeleton: greeting header, KPI row and two widget rows. */
export default function DashboardLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-36" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <KpiRowSkeleton />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WidgetSkeleton rows={5} />
          </div>
          <WidgetSkeleton rows={5} />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WidgetSkeleton rows={4} chart />
          <WidgetSkeleton rows={4} chart />
          <WidgetSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
