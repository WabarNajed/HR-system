import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** My profile skeleton: identity header with tabs, then two information cards. */
export default function ProfileLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="h-16 bg-subtle sm:h-20" />
        <div className="-mt-9 flex flex-col gap-4 px-5 pb-4 sm:-mt-10 sm:flex-row sm:items-end sm:gap-5">
          <Skeleton className="size-[4.5rem] rounded-full ring-4 ring-card sm:size-20" />
          <div className="flex flex-1 flex-col gap-2 pb-1">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <div className="flex gap-6 px-5 pb-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, c) => (
          <div key={c} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32 max-w-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
