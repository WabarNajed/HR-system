'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MailIcon, PencilIcon, PowerIcon, PowerOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, type RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { useErrorMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { setEmailTemplateActive } from '../actions';
import { TEMPLATE_GROUPS, templateGroup } from '../constants';
import type { EmailTemplateRow } from '../queries';

type Row = Pick<EmailTemplateRow, 'id' | 'key' | 'name_ar' | 'name_en' | 'subject_ar' | 'subject_en' | 'is_active' | 'updated_at'>;

/** Email templates catalog (client-side table; 16–20 rows). Row click opens the editor. */
export function EmailTemplatesList({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  const t = useTranslations('emailTemplates');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const df = useDateFormat();
  const router = useRouter();
  const resolve = useErrorMessage();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (row: Row, active: boolean) => {
    setBusy(row.key);
    startTransition(async () => {
      const result = await setEmailTemplateActive({ key: row.key, active });
      setBusy(null);
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  const actions = (r: Row): RowAction<Row>[] => [
    { label: canEdit ? t('list.edit') : tc('view'), icon: PencilIcon, href: `/settings/email-templates/${r.key}` },
    { label: r.is_active ? tc('deactivate') : tc('activate'), icon: r.is_active ? PowerOffIcon : PowerIcon, onSelect: () => toggle(r, !r.is_active), hidden: !canEdit },
  ];

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => localized(r, 'name', locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('list.columns.template')} />,
        cell: ({ row }) => (
          <div className="flex max-w-72 min-w-48 items-center gap-2.5 whitespace-normal">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <MailIcon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-foreground">{localized(row.original, 'name', locale)}</div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <span className="shrink-0">{t(`groups.${templateGroup(row.original.key)}`)}</span>
                <span aria-hidden>·</span>
                <span dir="ltr" className="truncate font-mono text-2xs text-faint-foreground">
                  {row.original.key}
                </span>
              </div>
            </div>
          </div>
        ),
        meta: { label: t('list.columns.template') },
      },
      {
        id: 'group',
        accessorFn: (r) => templateGroup(r.key),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('list.columns.group')} />,
        cell: ({ row }) => <span className="whitespace-nowrap text-foreground">{t(`groups.${templateGroup(row.original.key)}`)}</span>,
        meta: { label: t('list.columns.group'), defaultHidden: true },
      },
      {
        id: 'subject',
        accessorFn: (r) => localized(r, 'subject', locale),
        enableSorting: false,
        header: () => t('list.columns.subject'),
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-[26rem] min-w-40 text-[0.8125rem] leading-snug whitespace-normal text-muted-foreground" title={localized(row.original, 'subject', locale)}>
            {localized(row.original, 'subject', locale)}
          </span>
        ),
        meta: { label: t('list.columns.subject') },
      },
      {
        id: 'updated_at',
        accessorFn: (r) => r.updated_at,
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('lastUpdated')} />,
        cell: ({ row }) => <span className="numeric whitespace-nowrap text-muted-foreground">{df.date(row.original.updated_at)}</span>,
        meta: { label: tc('lastUpdated'), width: '8.5rem' },
      },
      {
        id: 'status',
        accessorFn: (r) => (r.is_active ? 'active' : 'inactive'),
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('status')} />,
        cell: ({ row }) =>
          canEdit ? (
            <SimpleTooltip content={row.original.is_active ? tc('active') : tc('inactive')}>
              <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={row.original.is_active}
                  disabled={busy === row.original.key}
                  onCheckedChange={(v) => toggle(row.original, v)}
                  aria-label={`${localized(row.original, 'name', locale)} · ${row.original.is_active ? tc('active') : tc('inactive')}`}
                />
              </span>
            </SimpleTooltip>
          ) : (
            <StatusBadge domain="record" status={row.original.is_active ? 'active' : 'inactive'} size="sm" />
          ),
        meta: { label: tc('status'), width: '5.5rem' },
      },
      actionsColumn<Row>(actions),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, canEdit, busy],
  );

  return (
    <DataTable
      tableId="settings-email-templates"
      mode="client"
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowHref={(r) => `/settings/email-templates/${r.key}`}
      searchable
      searchPlaceholder={t('list.search')}
      searchText={(r) => [r.name_ar, r.name_en, r.key, r.subject_ar, r.subject_en].join(' ')}
      filters={[
        {
          key: 'group',
          title: t('list.columns.group'),
          options: TEMPLATE_GROUPS.filter((g) => rows.some((r) => templateGroup(r.key) === g)).map((g) => ({
            value: g,
            label: t(`groups.${g}`),
            count: rows.filter((r) => templateGroup(r.key) === g).length,
          })),
          accessor: (r) => templateGroup(r.key),
        },
        {
          key: 'status',
          title: tc('status'),
          options: [
            { value: 'active', label: tc('active') },
            { value: 'inactive', label: tc('inactive') },
          ],
          accessor: (r) => (r.is_active ? 'active' : 'inactive'),
        },
      ]}
      pagination={false}
      maxHeight="none"
      emptyState={{ icon: MailIcon, title: t('list.emptyTitle'), description: t('list.emptyDescription') }}
      renderMobileCard={(r) => (
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
            <MailIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">{localized(r, 'name', locale)}</span>
              <StatusBadge domain="record" status={r.is_active ? 'active' : 'inactive'} size="sm" />
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{localized(r, 'subject', locale)}</p>
            <p className="mt-0.5 text-xs text-faint-foreground">
              {t(`groups.${templateGroup(r.key)}`)} · {df.date(r.updated_at)}
            </p>
          </div>
        </div>
      )}
    />
  );
}
