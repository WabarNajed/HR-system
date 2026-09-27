import { DownloadIcon, LanguagesIcon, UploadIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { getSchema } from '../lib/schemas';
import type { ImportType } from '../lib/types';
import { importHref, templateHref, TYPE_GROUPS, TYPE_ICONS } from './type-meta';

/** Template cards for the 10 import types, grouped (People · Employee records · Master data). */
export async function TemplatesGrid({ allowed }: { allowed: readonly ImportType[] }) {
  const t = await getTranslations('dataManagement');
  const locale = (await getLocale()) as 'ar' | 'en';
  const other = locale === 'ar' ? 'en' : 'ar';
  return (
    <div className="flex flex-col gap-5">
      <p className="text-meta text-muted-foreground">{t('templates.description')}</p>
      {TYPE_GROUPS.map((group) => (
        <section key={group.key} className="flex flex-col gap-2.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t(`groups.${group.key}`)}</h3>
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {group.types.map((type) => {
              const Icon = TYPE_ICONS[type];
              const schema = getSchema(type);
              const columns = schema.fields.filter((f) => f.template !== false).length;
              const required = schema.requiredAnyOf.length;
              const can = allowed.includes(type);
              return (
                <li key={type} data-template={type} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3.5 shadow-xs">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{t(`types.${type}.title`)}</div>
                      <p className="mt-0.5 line-clamp-2 text-meta text-muted-foreground">{t(`types.${type}.description`)}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <span className="me-auto text-xs text-muted-foreground numeric">
                      {t('templates.columnsCount', { count: columns })} · {t('templates.requiredCount', { count: required })}
                    </span>
                    <SimpleTooltip content={t('templates.otherLanguage')}>
                      <Button asChild variant="ghost" size="icon-sm" aria-label={t('templates.otherLanguage')}>
                        <a href={templateHref(type, other)} download>
                          <LanguagesIcon />
                        </a>
                      </Button>
                    </SimpleTooltip>
                    <Button asChild variant="outline" size="sm">
                      <a href={templateHref(type)} download>
                        <DownloadIcon />
                        {t('templates.download')}
                      </a>
                    </Button>
                    {can ? (
                      <Button asChild variant="soft" size="sm">
                        <Link href={importHref({ type })}>
                          <UploadIcon />
                          {t('templates.import')}
                        </Link>
                      </Button>
                    ) : (
                      <SimpleTooltip content={t('templates.noPermission')}>
                        <span tabIndex={0} className="inline-flex">
                          <Button variant="soft" size="sm" disabled>
                            <UploadIcon />
                            {t('templates.import')}
                          </Button>
                        </span>
                      </SimpleTooltip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
