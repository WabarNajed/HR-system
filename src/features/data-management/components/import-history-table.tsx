'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { DownloadIcon, EyeIcon, FileSpreadsheetIcon, PlayIcon, TerminalIcon, UploadIcon, XCircleIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cancelImportAction } from '../actions';
import { IMPORT_TYPES } from '../lib/types';
import type { ImportView } from '../types';
import { ImportDetailsSheet } from './import-details-sheet';
import { errorReportHref, importHref, TYPE_ICONS } from './type-meta';
import { useLooseT, useRunAction } from './use-dm';

const STATUSES = ['uploaded', 'validated', 'importing', 'completed', 'failed', 'cancelled'] as const;

type Props = {
  rows: ImportView[];
  total: number;
  errorsOnly: boolean;
  canStart: boolean;
};

export function ImportHistoryTable({ rows, total, errorsOnly, canStart }: Props) {
  const t = useTranslations('dataManagement');
  const types = useLooseT('dataManagement.types');
  const statuses = useLooseT('statuses.import');
  const fmt = useDateFormat();
  const router = useRouter();
  const run = useRunAction();
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const closeDetails = useCallback((open: boolean) => {
    if (!open) setDetailsId(null);
  }, []);

  const filters = useMemo<FilterDef<ImportView>[]>(
    () => [
      { key: 'type', title: t('history.filters.type'), options: IMPORT_TYPES.map((v) => ({ value: v, label: types(`${v}.title`), icon: TYPE_ICONS[v] })) },
      { key: 'status', title: t('history.filters.status'), options: STATUSES.map((v) => ({ value: v, label: statuses(v) })) },
      { key: 'errors', title: t('history.filters.errorsOnly'), multiple: false, options: [{ value: '1', label: t('history.filters.errorsOnly') }] },
    ],
    [t, types, statuses],
  );

  const columns = useMemo<ColumnDef<ImportView>[]>(
    () => [
      {
        id: 'file_name',
        accessorKey: 'fileName',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('history.columns.file')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
                <FileSpreadsheetIcon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="max-w-[18rem] truncate font-medium text-foreground">
                  <bdi>{r.fileName}</bdi>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground numeric">{t('history.rowsSummary', { total: r.totals.total })}</div>
              </div>
            </div>
          );
        },
        meta: { label: t('history.columns.file'), width: '19rem' },
        enableHiding: false,
      },
      {
        id: 'import_type',
        accessorKey: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('history.columns.type')} />,
        cell: ({ row }) => {
          const Icon = TYPE_ICONS[row.original.type];
          return (
            <span className="inline-flex items-center gap-1.5 text-meta text-foreground">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              {types(`${row.original.type}.title`)}
            </span>
          );
        },
        meta: { label: t('history.columns.type') },
      },
      {
        id: 'by',
        header: t('history.columns.by'),
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (r.summary.source === 'cli')
            return (
              <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
                <TerminalIcon className="size-3.5" aria-hidden />
                {t('history.cli')}
              </span>
            );
          return (
            <span className="block max-w-[12rem] truncate text-meta text-foreground">
              <bdi>{r.createdBy?.name || r.createdBy?.email || '—'}</bdi>
            </span>
          );
        },
        meta: { label: t('history.columns.by') },
      },
      {
        id: 'created_at',
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('history.columns.at')} />,
        cell: ({ row }) => <span className="text-meta whitespace-nowrap text-foreground">{fmt.dateTime(row.original.createdAt)}</span>,
        meta: { label: t('history.columns.at') },
      },
      {
        id: 'error_rows',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('history.columns.result')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-1.5 text-xs font-medium numeric">
              <span title={t('report.imported')} className="rounded-sm bg-success-soft px-1.5 py-0.5 text-success-soft-foreground">{r.totals.imported}</span>
              {r.totals.warning ? (
                <span title={t('report.warnings')} className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-warning-soft-foreground">
                  {r.totals.warning}
                </span>
              ) : null}
              {r.totals.error ? (
                <span title={t('report.errors')} className="rounded-sm bg-danger-soft px-1.5 py-0.5 text-danger-soft-foreground">
                  {r.totals.error}
                </span>
              ) : null}
              <span className="sr-only">{t('history.resultSummary', { imported: r.totals.imported, errors: r.totals.error })}</span>
            </div>
          );
        },
        meta: { label: t('history.columns.result') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('history.columns.status')} />,
        cell: ({ row }) => <StatusBadge domain="import" status={row.original.status} size="sm" />,
        meta: { label: t('history.columns.status') },
      },
      actionsColumn<ImportView>((r) => [
        { label: t('history.actions.details'), icon: EyeIcon, onSelect: () => setDetailsId(r.id) },
        {
          label: t('history.actions.continue'),
          icon: PlayIcon,
          href: importHref({ id: r.id }),
          hidden: !(r.status === 'uploaded' || r.status === 'validated' || r.status === 'importing'),
        },
        {
          label: t('history.actions.downloadReport'),
          icon: DownloadIcon,
          onSelect: () => window.location.assign(errorReportHref(r.id)),
          hidden: !(r.totals.error || r.totals.warning),
        },
        {
          label: t('history.actions.cancel'),
          icon: XCircleIcon,
          variant: 'destructive',
          separatorBefore: true,
          onSelect: () => setCancelId(r.id),
          hidden: !(r.status === 'uploaded' || r.status === 'validated'),
        },
      ]),
    ],
    [t, types, fmt],
  );

  return (
    <>
      <DataTable
        tableId="dm-import-history"
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDetailsId(r.id)}
        filters={filters}
        searchPlaceholder={t('history.columns.file')}
        exportDataset="imports"
        exportFormats={['xlsx', 'csv', 'pdf']}
        defaultSort={{ id: 'created_at', desc: true }}
        maxHeight="none"
        emptyState={
          errorsOnly
            ? { icon: FileSpreadsheetIcon, title: t('history.errorsEmpty.title'), description: t('history.errorsEmpty.description') }
            : {
                icon: UploadIcon,
                title: t('history.empty.title'),
                description: t('history.empty.description'),
                action: canStart ? (
                  <Button asChild size="sm">
                    <Link href={importHref()}>
                      <UploadIcon />
                      {t('history.empty.action')}
                    </Link>
                  </Button>
                ) : undefined,
              }
        }
        renderMobileCard={(r) => {
          const Icon = TYPE_ICONS[r.type];
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  <bdi>{r.fileName}</bdi>
                </span>
                <StatusBadge domain="import" status={r.status} size="sm" />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {types(`${r.type}.title`)} · {fmt.dateTime(r.createdAt)}
                </span>
                <span className="numeric">{t('history.resultSummary', { imported: r.totals.imported, errors: r.totals.error })}</span>
              </div>
            </div>
          );
        }}
      />
      <ImportDetailsSheet importId={detailsId} seed={rows.find((r) => r.id === detailsId) ?? null} onOpenChange={closeDetails} />
      <ConfirmDialog
        open={Boolean(cancelId)}
        onOpenChange={(o) => !o && setCancelId(null)}
        title={t('wizard.cancelConfirmTitle')}
        description={t('wizard.cancelConfirmDescription')}
        confirmLabel={t('history.actions.cancel')}
        variant="danger"
        onConfirm={async () => {
          if (!cancelId) return;
          const res = await run(cancelImportAction({ importId: cancelId }));
          if (res.ok) {
            setCancelId(null);
            router.refresh();
          }
          return res.ok;
        }}
      />
    </>
  );
}
