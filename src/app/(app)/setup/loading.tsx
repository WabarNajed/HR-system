import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <Skeleton className="h-6 w-full" />
          {Array.from({ length: 11 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
      </div>
    </div>
  );
}
