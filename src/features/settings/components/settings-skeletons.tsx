import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

function SectionSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <Skeleton className="size-7 rounded-md" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
      <div className="grid gap-x-5 gap-y-4 p-5 md:grid-cols-2">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Loading state for the Organization / Branding forms (optionally with the preview column). */
export function SettingsFormSkeleton({ preview = false }: { preview?: boolean }) {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className={cn('grid grid-cols-1 items-start gap-5', preview && 'xl:grid-cols-[minmax(0,1fr)_25rem]')}>
        <div className="flex flex-col gap-5">
          <SectionSkeleton fields={4} />
          <SectionSkeleton fields={6} />
          <SectionSkeleton fields={2} />
        </div>
        {preview ? <Skeleton className="hidden h-[26rem] rounded-lg xl:block" /> : null}
      </div>
    </div>
  );
}

/** Loading state for the Settings console home. */
export function SettingsHomeSkeleton() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-card">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 rounded-lg" />
      </div>
    </div>
  );
}
