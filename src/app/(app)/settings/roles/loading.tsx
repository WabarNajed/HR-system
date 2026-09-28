import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Roles & permissions skeleton: header, roles list and the permission matrix. */
export default function RolesLoading() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[14.5rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-card lg:flex">
          <Skeleton className="mb-1 h-5 w-20" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5">
              <Skeleton className="size-8 rounded-md" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
            <Skeleton className="size-10 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-8 w-40" />
            </div>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                </div>
                <div className="hidden gap-6 sm:flex">
                  {Array.from({ length: 6 }, (_, j) => (
                    <Skeleton key={j} className="size-4 rounded-sm" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
