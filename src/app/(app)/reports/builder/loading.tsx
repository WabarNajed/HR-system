import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Builder skeleton: header, the four configuration cards and the preview panel. */
export default function ReportBuilderLoading() {
  const t = useTranslations('common.states');
  const card = (className: string, lines: number) => (
    <div className={`flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card ${className}`}>
      <Skeleton className="h-5 w-36" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {card('xl:col-span-3', 8)}
        {card('xl:col-span-5', 8)}
        <div className="flex flex-col gap-5 xl:col-span-4">
          {card('', 2)}
          {card('', 2)}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 shadow-card">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-48 w-full" />
      </div>
    </div>
  );
}
