import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Notifications center skeleton: header, list card with tabs and rows, summary panel. */
export default function NotificationsLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-5">
        <div className="rounded-lg border border-border bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div className="flex gap-4">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-8 w-52" />
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card lg:flex">
          <Skeleton className="h-4 w-24" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7" />
          ))}
        </div>
      </div>
    </div>
  );
}
