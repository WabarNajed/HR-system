'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRightIcon, InboxIcon, MailCheckIcon, MailWarningIcon, MailXIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { DataTable, DataTableColumnHeader, type FilterOption } from '@/components/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatRelative } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import type { EmailLogRow } from '../queries';

type Props = {
  rows: EmailLogRow[];
  total: number;
  /** template key → localized template name */
  templateNames: Record<string, string>;
  templateOptions: FilterOption[];
  nowIso: string;
};

const STATUS_ICON = { sent: MailCheckIcon, failed: MailXIcon, skipped: MailWarningIcon } as const;

/** Email log: every delivery attempt (sent / failed / skipped) with server-side pagination. */
export function EmailLogTable({ rows, total, templateNames, templateOptions, nowIso }: Props) {
  const t = useTranslations('emailTemplates.log');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const df = useDateFormat();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const typeName = (key: string | null) => (key ? (templateNames[key] ?? key) : t('noTemplate'));
  const related = (r: EmailLogRow) => {
    if (!r.relatedKind) return <span className="text-faint-foreground">—</span>;
    const label = t(`related.${r.relatedKind as 'request'}`);
    if (!r.href) return <span className="text-muted-foreground">{label}</span>;
    return (
      <Link href={r.href} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap text-primary hover:underline">
        {label}
        <ArrowUpRightIcon className="size-3.5 flip-rtl" aria-hidden />
      </Link>
    );
  };
  const reason = (r: EmailLogRow) => {
    if (r.status === 'sent') return <span className="text-faint-foreground">—</span>;
    return (
      <span className="line-clamp-2 max-w-72 min-w-40 text-xs break-words text-muted-foreground" dir="auto" title={r.error ?? undefined}>
        {r.error || t('noReason')}
      </span>
    );
  };

  const columns = useMemo<ColumnDef<EmailLogRow>[]>(
    () => [
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.sentAt')} />,
        cell: ({ row }) => (
          <div className="leading-tight whitespace-nowrap">
            <div className="numeric text-[0.8125rem] text-foreground">{df.dateTime(row.original.sent_at ?? row.original.created_at)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{formatRelative(row.original.created_at, locale, now)}</div>
          </div>
        ),
        meta: { label: t('columns.sentAt'), width: '10.5rem' },
      },
      {
        id: 'recipient',
        accessorKey: 'recipient',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.recipient')} />,
        cell: ({ row }) => (
          <span dir="ltr" className="block max-w-56 truncate text-start text-foreground">
            {row.original.recipient}
          </span>
        ),
        meta: { label: t('columns.recipient') },
      },
      {
        id: 'subject',
        accessorKey: 'subject',
        enableSorting: false,
        header: () => t('columns.subject'),
        cell: ({ row }) => (
          <div className="max-w-80 min-w-44 leading-tight whitespace-normal">
            <div className="line-clamp-1 text-foreground" dir="auto">
              {row.original.subject || '—'}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">{typeName(row.original.template_key)}</div>
          </div>
        ),
        meta: { label: t('columns.subject') },
      },
      {
        id: 'related',
        enableSorting: false,
        header: () => t('columns.related'),
        cell: ({ row }) => related(row.original),
        meta: { label: t('columns.related') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tRoot('common.status')} />,
        cell: ({ row }) => <StatusBadge domain="email" status={row.original.status} size="sm" />,
        meta: { label: tRoot('common.status') },
      },
      {
        id: 'error',
        enableSorting: false,
        header: () => t('columns.reason'),
        cell: ({ row }) => reason(row.original),
        meta: { label: t('columns.reason') },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale, templateNames, now],
  );

  return (
    <DataTable
      tableId="settings-email-log"
      mode="server"
      columns={columns}
      data={rows}
      total={total}
      getRowId={(r) => r.id}
      searchable
      searchPlaceholder={t('search')}
      defaultSort={{ id: 'created_at', desc: true }}
      filters={[
        {
          key: 'status',
          title: tRoot('common.status'),
          options: (['sent', 'failed', 'skipped'] as const).map((s) => ({ value: s, label: tRoot(`statuses.email.${s}`), icon: STATUS_ICON[s] })),
        },
        { key: 'template', title: t('columns.type'), options: templateOptions },
        { type: 'dateRange', key: 'sent', title: t('columns.sentAt') },
      ]}
      emptyState={{ icon: InboxIcon, title: t('emptyTitle'), description: t('emptyDescription') }}
      renderMobileCard={(r) => (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span dir="ltr" className="min-w-0 truncate text-sm font-medium text-foreground">
              {r.recipient}
            </span>
            <StatusBadge domain="email" status={r.status} size="sm" />
          </div>
          <p className="line-clamp-1 text-sm text-foreground" dir="auto">
            {r.subject || '—'}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{typeName(r.template_key)}</span>
            <span aria-hidden>·</span>
            <span className="numeric">{df.dateTime(r.sent_at ?? r.created_at)}</span>
            {r.relatedKind ? (
              <>
                <span aria-hidden>·</span>
                {related(r)}
              </>
            ) : null}
          </div>
          {r.status !== 'sent' && r.error ? (
            <p className="text-xs text-muted-foreground" dir="auto">
              {r.error}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
