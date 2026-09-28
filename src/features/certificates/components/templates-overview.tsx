import { ArrowUpLeftIcon, FileBadgeIcon, StarIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resolveLocale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import type { TemplateListItem } from '../types';
import { CERTIFICATE_TYPES } from '../variables';

/** Templates tab of the Certificate Center: cards per certificate type linking to the editor. */
export async function TemplatesOverview({ templates }: { templates: TemplateListItem[] }) {
  const [t, te, rawLocale] = await Promise.all([getTranslations('certificates'), getTranslations('enums'), getLocale()]);
  const locale = resolveLocale(rawLocale);
  const enumLabel = (group: string, value: string) => {
    const loose = te as unknown as { has: (k: string) => boolean; (k: string): string };
    return loose.has(`${group}.${value}`) ? loose(`${group}.${value}`) : value;
  };

  if (!templates.length) {
    return (
      <EmptyState
        variant="card"
        icon={FileBadgeIcon}
        title={t('empty.templatesTitle')}
        description={t('empty.templatesDescription')}
        action={
          <Button asChild size="sm">
            <Link href="/settings/document-templates">{t('manageTemplates')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-meta text-muted-foreground">{t('templatesTab.description')}</p>
        <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
          <Link href="/settings/document-templates">{t('manageTemplates')}</Link>
        </Button>
      </div>
      {CERTIFICATE_TYPES.map((type) => {
        const group = templates.filter((tpl) => tpl.certificate_type === type);
        if (!group.length) return null;
        return (
          <section key={type} className="flex flex-col gap-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {enumLabel('certificateType', type)}
              <span className="numeric rounded-full bg-muted px-1.5 text-2xs leading-4 font-semibold">{group.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {group.map((tpl) => (
                <Link
                  key={tpl.id}
                  href={`/settings/document-templates/${tpl.id}`}
                  className={cn(
                    'group flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-card transition-[border-color,box-shadow]',
                    'hover:border-primary/40 hover:shadow-raised focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      tpl.status === 'published' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <FileBadgeIcon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate text-card-title group-hover:text-primary">{localized(tpl, 'name', locale)}</h3>
                      <ArrowUpLeftIcon className="size-4 shrink-0 text-faint-foreground opacity-0 transition-opacity group-hover:opacity-100 ltr:-scale-x-100" aria-hidden />
                    </div>
                    <p className="mt-0.5 truncate text-meta text-muted-foreground">
                      {enumLabel('certificateVariant', tpl.variant)} · {enumLabel('certificateLanguage', tpl.language)}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge domain="template" status={tpl.status} size="sm" />
                      {tpl.is_default ? (
                        <Badge variant="secondary" size="sm" className="gap-1">
                          <StarIcon className="size-3 fill-current" aria-hidden />
                          {t('templatesTab.default')}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" size="sm" className="numeric">
                        {t('templatesTab.versionShort', { version: tpl.current_version })}
                      </Badge>
                      <span className="text-meta text-faint-foreground">{t('templatesTab.issued', { count: tpl.issued_count })}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
