import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** New Request skeleton: header, stepper and the type grid. */
export default function NewRequestLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-14 w-full rounded-lg" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="flex gap-3">
              <Skeleton className="size-11 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
