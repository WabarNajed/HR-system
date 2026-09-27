import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Settings › Document templates list skeleton. */
export function TemplatesListSkeleton() {
  const t = useTranslations('common.states');
  return (
    <div className="flex flex-col gap-5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 bg-card px-4 py-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-6 w-10" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex gap-2 border-b border-border p-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-48" />
        </div>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-16 md:block" />
            <Skeleton className="hidden h-5 w-20 md:block" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Template editor skeleton (full-bleed workspace: top bar + three panes). */
export function TemplateEditorSkeleton() {
  const t = useTranslations('common.states');
  return (
    <div
      className="fixed inset-x-0 top-14 bottom-0 z-20 flex flex-col bg-background lg:start-(--shell-sidebar)"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{t('loadingContent')}</span>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
        <Skeleton className="size-8" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-60 max-w-full" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[18rem_minmax(0,1fr)_17.5rem]">
        <div className="hidden flex-col gap-4 border-e border-border bg-card p-4 xl:flex">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          <div className="flex h-11 items-center gap-4 border-b border-border bg-card px-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex h-11 items-center gap-2 border-b border-border bg-card px-3">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="size-7" />
            ))}
          </div>
          <div className="flex-1 bg-muted/50 p-6">
            <div className="mx-auto flex max-w-[52rem] flex-col gap-3 rounded-md border border-border bg-card p-10">
              <Skeleton className="h-4 w-40 self-end" />
              <Skeleton className="mx-auto h-6 w-56" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </div>
        <div className="hidden flex-col gap-3 border-s border-border bg-card p-4 xl:flex">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
