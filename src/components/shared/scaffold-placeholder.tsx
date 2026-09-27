import { ArrowLeftIcon, HammerIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ScaffoldPlaceholderProps = {
  /** Module / route id — rendered as `data-scaffold` so QA can find unfinished areas (grep "ScaffoldPlaceholder"). */
  module: string;
  /** Page title (translated). When omitted, only the compact card renders (e.g. inside a tab). */
  title?: ReactNode;
  description?: ReactNode;
  /** Header actions, if any real ones exist already. */
  actions?: ReactNode;
  className?: string;
};

/**
 * TEMPORARY route scaffold: a translated, compact "This section is being set up" card (with the
 * page header). Module agents replace every usage with the real page.
 */
export function ScaffoldPlaceholder({ module, title, description, actions, className }: ScaffoldPlaceholderProps) {
  const t = useTranslations('common');
  const card = (
    <section
      data-scaffold={module}
      data-testid="scaffold-placeholder"
      className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong bg-card px-6 py-10 text-center shadow-card sm:flex-row sm:items-center sm:gap-5 sm:px-8 sm:py-7 sm:text-start"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary-soft text-secondary-soft-foreground ring-1 ring-inset ring-current/10">
        <HammerIcon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <h2 className="text-card-title">{t('scaffold.title')}</h2>
          <Badge variant="secondary" size="sm" dot>
            {t('scaffold.badge')}
          </Badge>
        </div>
        <p className="mt-1 max-w-2xl text-meta text-muted-foreground">{t('scaffold.description')}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0">
        <Link href="/dashboard">
          <ArrowLeftIcon className="rtl:rotate-180" />
          {t('states.backToDashboard')}
        </Link>
      </Button>
    </section>
  );

  if (!title) return <div className={className}>{card}</div>;
  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <PageHeader title={title} description={description} actions={actions} />
      {card}
    </div>
  );
}
