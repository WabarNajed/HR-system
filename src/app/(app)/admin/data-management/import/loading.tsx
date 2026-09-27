import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

export default function ImportWizardLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="rounded-lg border border-border bg-card p-5 shadow-card">
        <Skeleton className="mb-2 h-6 w-56" />
        <Skeleton className="mb-5 h-4 w-80 max-w-full" />
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
