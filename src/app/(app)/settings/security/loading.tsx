import { useTranslations } from 'next-intl';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { Skeleton } from '@/components/ui/skeleton';

function CardSkeleton({ rows, tall = false }: { rows: number; tall?: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-md" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-44" />
            {tall ? <Skeleton className="h-3 w-72 max-w-full" /> : null}
          </div>
          <Skeleton className={tall ? 'h-9 w-40' : 'h-4 w-20'} />
        </div>
      ))}
    </div>
  );
}

/** Security settings skeleton: settings + sign-in activity, with the owners / policy side column. */
export default function SecurityLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <SplitLayout
        main={
          <>
            <CardSkeleton rows={2} tall />
            <CardSkeleton rows={6} />
          </>
        }
        side={
          <>
            <CardSkeleton rows={2} />
            <CardSkeleton rows={4} />
          </>
        }
      />
    </div>
  );
}
