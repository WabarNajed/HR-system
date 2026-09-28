'use client';

import {
  CopyIcon,
  FileBadgeIcon,
  FilePlus2Icon,
  MoreHorizontalIcon,
  PencilLineIcon,
  PowerIcon,
  PowerOffIcon,
  SendIcon,
  StarIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { SearchInput } from '@/components/shared/search-input';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { publishTemplate, setDefaultTemplate, setTemplateActive } from '../actions';
import type { TemplateListItem } from '../types';
import type { CertificateType } from '../variables';
import { CreateTemplateDialog, type CreateTemplateSeed } from './create-template-dialog';
import { useActionToast } from './use-action-toast';
import { useCertificateLabels } from './use-certificate-labels';

type Props = {
  templates: TemplateListItem[];
  canEdit: boolean;
  /** Certificate types shown (certificate templates exclude custom HR letters). */
  types: readonly CertificateType[];
};

/** Template list grouped by certificate type: variant, language, version, status, last edited, usage + actions. */
export function TemplatesManager({ templates, canEdit, types }: Props) {
  const t = useTranslations('templates.list');
  const tt = useTranslations('templates');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const labels = useCertificateLabels();
  const { run } = useActionToast();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<'all' | CertificateType>('all');
  const [seed, setSeed] = useState<CreateTemplateSeed | null>(null);
  const [deactivating, setDeactivating] = useState<TemplateListItem | null>(null);
  const [pending, startTransition] = useTransition();

  const scoped = templates.filter((tpl) => types.includes(tpl.certificate_type));
  const stats = {
    total: scoped.length,
    published: scoped.filter((x) => x.status === 'published').length,
    drafts: scoped.filter((x) => x.status === 'draft').length,
    unpublished: scoped.filter((x) => x.has_unpublished_changes).length,
  };

  const q = query.trim().toLowerCase();
  const groups = types
      .filter((ty) => type === 'all' || type === ty)
      .map((ty) => ({
        type: ty,
        items: scoped.filter(
          (tpl) =>
            tpl.certificate_type === ty &&
            (!q || [tpl.name_ar, tpl.name_en, tpl.key, labels.variant(tpl.variant)].some((s) => s.toLowerCase().includes(q))),
        ),
      }))
    .filter((g) => g.items.length);

  const act = (fn: () => Promise<unknown>) => startTransition(async () => void (await fn()));

  const menu = (tpl: TemplateListItem) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('actions.edit')} disabled={pending} className="data-[state=open]:bg-accent">
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild>
          <Link href={`/settings/document-templates/${tpl.id}`}>
            <PencilLineIcon />
            {t('actions.edit')}
          </Link>
        </DropdownMenuItem>
        {canEdit ? (
          <>
            <DropdownMenuItem onSelect={() => setSeed({ source: tpl })}>
              <CopyIcon />
              {t('actions.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {tpl.status === 'draft' || tpl.has_unpublished_changes ? (
              <DropdownMenuItem onSelect={() => act(() => run(publishTemplate({ id: tpl.id })))}>
                <SendIcon className="rtl:-scale-x-100" />
                {t('actions.publish')}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={tpl.is_default || tpl.status !== 'published'}
              title={tpl.status !== 'published' ? t('setDefaultDisabled') : undefined}
              onSelect={() => act(() => run(setDefaultTemplate({ id: tpl.id })))}
            >
              <StarIcon />
              {t('actions.setDefault')}
            </DropdownMenuItem>
            {tpl.is_active ? (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(tpl)}>
                <PowerOffIcon />
                {t('actions.deactivate')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={tpl.published_version === null}
                title={tpl.published_version === null ? t('activateDisabled') : undefined}
                onSelect={() => act(() => run(setTemplateActive({ id: tpl.id, active: true })))}
              >
                <PowerIcon />
                {t('actions.activate')}
              </DropdownMenuItem>
            )}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const versionCell = (tpl: TemplateListItem) => (
    <div className="flex flex-col gap-0.5">
      <span className="numeric font-medium">{tpl.current_version}</span>
      {tpl.has_unpublished_changes ? (
        <SimpleTooltip content={t('unpublishedTooltip', { current: tpl.current_version, published: tpl.published_version ?? 0 })}>
          <span className="w-fit cursor-help text-2xs font-medium text-warning">{t('publishedVersion', { version: tpl.published_version ?? 0 })}</span>
        </SimpleTooltip>
      ) : null}
    </div>
  );

  const nameCell = (tpl: TemplateListItem) => {
    const primary = localized(tpl, 'name', locale);
    const secondary = locale === 'ar' ? tpl.name_en : tpl.name_ar;
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md',
            tpl.status === 'published' ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <FileBadgeIcon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link href={`/settings/document-templates/${tpl.id}`} className="truncate font-medium hover:text-primary hover:underline hover:underline-offset-4">
              {primary}
            </Link>
            {tpl.is_default ? (
              <SimpleTooltip content={t('defaultTooltip')}>
                <StarIcon className="size-3.5 shrink-0 fill-secondary text-secondary" aria-label={t('default')} />
              </SimpleTooltip>
            ) : null}
          </div>
          {secondary && secondary !== primary ? (
            <div className="mt-0.5 truncate text-meta text-muted-foreground" dir={locale === 'ar' ? 'ltr' : 'rtl'}>
              <bdi>{secondary}</bdi>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card shadow-card md:grid-cols-4">
        {(
          [
            ['total', stats.total, 'text-foreground'],
            ['published', stats.published, 'text-success'],
            ['drafts', stats.drafts, 'text-muted-foreground'],
            ['unpublished', stats.unpublished, 'text-warning'],
          ] as const
        ).map(([key, value, tone], i) => (
          <div key={key} className={cn('flex flex-col gap-0.5 px-4 py-3', i % 2 === 1 && 'border-s border-border', i >= 2 && 'max-md:border-t md:border-s')}>
            <span className="text-meta text-muted-foreground">{t(`stats.${key}`)}</span>
            <span className={cn('numeric text-xl font-semibold', tone)}>{value}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
          <SearchInput value={query} onSearch={setQuery} debounce={150} placeholder={t('searchPlaceholder')} wrapperClassName="sm:max-w-xs sm:flex-1" />
          <Select value={type} onValueChange={(v) => setType(v as 'all' | CertificateType)}>
            <SelectTrigger className="sm:w-60" aria-label={tt('fields.type')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTypes')}</SelectItem>
              {types.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {labels.type(ty)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-meta text-muted-foreground sm:ms-auto">{t('count', { count: groups.reduce((n, g) => n + g.items.length, 0) })}</span>
        </div>

        {groups.length ? (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-subtle text-start text-meta text-muted-foreground">
                    <th className="px-4 py-2.5 text-start font-medium">{t('columns.name')}</th>
                    <th className="px-2.5 py-2.5 text-start font-medium whitespace-nowrap">{t('columns.variantLanguage')}</th>
                    <th className="px-2.5 py-2.5 text-start font-medium">{t('columns.version')}</th>
                    <th className="px-2.5 py-2.5 text-start font-medium">{t('columns.status')}</th>
                    <th className="px-2.5 py-2.5 text-start font-medium">{t('columns.lastEdited')}</th>
                    <th className="px-2.5 py-2.5 text-end font-medium">{t('columns.usage')}</th>
                    <th className="w-11 px-2 py-2.5" />
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.type} className="border-b border-border last:border-b-0">
                    <tr className="bg-muted/40">
                      <th colSpan={7} className="px-4 py-1.5 text-start text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {labels.type(g.type)} <span className="numeric ms-1 text-faint-foreground">{g.items.length}</span>
                      </th>
                    </tr>
                    {g.items.map((tpl) => (
                      <tr key={tpl.id} className="border-t border-border transition-colors hover:bg-subtle/70">
                        <td className="max-w-80 px-4 py-2.5">{nameCell(tpl)}</td>
                        <td className="px-2.5 py-2.5">
                          <div className="flex flex-col items-start gap-1 leading-tight">
                            <span className="text-foreground">{labels.variant(tpl.variant)}</span>
                            <Badge variant="outline" size="sm" className="whitespace-nowrap">
                              {labels.language(tpl.language)}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-2.5 py-2.5">{versionCell(tpl)}</td>
                        <td className="px-2.5 py-2.5">
                          <StatusBadge domain="template" status={tpl.status} size="sm" className="whitespace-nowrap" />
                        </td>
                        <td className="px-2.5 py-2.5">
                          <div className="leading-tight">
                            <div className="numeric whitespace-nowrap">{fmt.date(tpl.updated_at)}</div>
                            {tpl.last_editor ? <div className="mt-0.5 max-w-36 truncate text-meta text-muted-foreground">{tpl.last_editor}</div> : null}
                          </div>
                        </td>
                        <td className="numeric px-2.5 py-2.5 text-end">{tpl.issued_count}</td>
                        <td className="px-2 py-2.5 text-end">{menu(tpl)}</td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            {/* Mobile cards */}
            <div className="md:hidden">
              {groups.map((g) => (
                <section key={g.type}>
                  <h3 className="border-b border-border bg-muted/40 px-4 py-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {labels.type(g.type)} <span className="numeric ms-1 text-faint-foreground">{g.items.length}</span>
                  </h3>
                  <ul className="divide-y divide-border">
                    {g.items.map((tpl) => (
                      <li key={tpl.id} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          {nameCell(tpl)}
                          {menu(tpl)}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 ps-12">
                          <StatusBadge domain="template" status={tpl.status} size="sm" />
                          <Badge variant="outline" size="sm">
                            {labels.variant(tpl.variant)}
                          </Badge>
                          <Badge variant="outline" size="sm">
                            {labels.language(tpl.language)}
                          </Badge>
                          <span className="numeric text-meta text-muted-foreground">{t('versionLabel', { version: tpl.current_version })}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={FileBadgeIcon}
            title={scoped.length ? t('empty') : tt('documentTemplates.title')}
            description={scoped.length ? undefined : tt('documentTemplates.description')}
            action={
              canEdit && !scoped.length ? (
                <Button size="sm" onClick={() => setSeed({ source: null })}>
                  <FilePlus2Icon />
                  {t('create')}
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      <CreateTemplateDialog seed={seed} templates={scoped} onOpenChange={(o) => !o && setSeed(null)} />
      <ConfirmDialog
        open={Boolean(deactivating)}
        onOpenChange={(o) => !o && setDeactivating(null)}
        variant="danger"
        title={t('deactivateTitle', { name: deactivating ? localized(deactivating, 'name', locale) : '' })}
        description={t('deactivateDescription')}
        confirmLabel={t('actions.deactivate')}
        onConfirm={async () => {
          if (!deactivating) return false;
          const result = await run(setTemplateActive({ id: deactivating.id, active: false }));
          return result.ok;
        }}
      />
    </div>
  );
}

/** "New template" header button (opens the same dialog). */
export function NewTemplateButton({ templates, defaultType }: { templates: TemplateListItem[]; defaultType?: CertificateType }) {
  const t = useTranslations('templates.list');
  const [seed, setSeed] = useState<CreateTemplateSeed | null>(null);
  return (
    <>
      <Button onClick={() => setSeed({ source: null, defaultType })}>
        <FilePlus2Icon />
        {t('create')}
      </Button>
      <CreateTemplateDialog seed={seed} templates={templates} onOpenChange={(o) => !o && setSeed(null)} />
    </>
  );
}
