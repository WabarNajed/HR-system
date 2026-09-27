import { useTranslations } from 'next-intl';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { Skeleton } from '@/components/ui/skeleton';

function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card ${className ?? ''}`}>
      <Skeleton className="h-5 w-40" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Request details skeleton: header, summary strip, split layout. */
export default function RequestDetailsLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex items-start gap-3.5">
        <Skeleton className="size-11 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-[4.5rem] w-full rounded-lg" />
      <SplitLayout
        main={
          <>
            <CardSkeleton lines={6} />
            <CardSkeleton lines={3} />
            <CardSkeleton lines={4} />
          </>
        }
        side={
          <>
            <CardSkeleton lines={3} />
            <CardSkeleton lines={5} />
          </>
        }
      />
    </div>
  );
}
