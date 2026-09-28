'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BuildingIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileStackIcon,
  FileTextIcon,
  InboxIcon,
  LockIcon,
  PencilIcon,
  RefreshCwIcon,
  ShieldIcon,
  Trash2Icon,
  UndoIcon,
  XCircleIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, type ReactNode } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type RowAction } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { localized } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { BUCKETS, fileRouteUrl } from '@/lib/storage';
import { DOCUMENT_EXPIRY_BANDS, DOCUMENT_STATUSES, DOCUMENT_TYPES } from '../constants';
import type { DocumentListRow, DocumentSummary } from '../types';
import { documentAbilities, FileTypeIcon, useDocumentDialogs, type DocumentDialogKind } from './document-dialogs';
import { ExpiryBadge, useBandOptions, useDocumentTypeLabel } from './labels';

export type DocumentsTableVariant = 'center' | 'review' | 'own' | 'profile';

export type DepartmentOption = { id: string; name_ar: string | null; name_en: string | null };

type Props = {
  variant: DocumentsTableVariant;
  rows: DocumentListRow[];
  total?: number;
  departments?: DepartmentOption[];
  exportEnabled?: boolean;
  emptyAction?: ReactNode;
};

function openFile(row: DocumentListRow, download = false) {
  if (!row.storage_path) return;
  const url = fileRouteUrl(BUCKETS.employeeDocuments, row.storage_path, { download });
  if (download) window.location.assign(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export function DocumentsTable({ variant, rows, total, departments = [], exportEnabled, emptyAction }: Props) {
  const t = useTranslations('documents');
  const ts = useTranslations('statuses.document');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const typeLabel = useDocumentTypeLabel();
  const { open, permissions, today } = useDocumentDialogs();
  const bandOptions = useBandOptions(DOCUMENT_EXPIRY_BANDS);
  const server = variant === 'center' || variant === 'review';
  const showEmployee = variant === 'center' || variant === 'review';

  const columns = useMemo<ColumnDef<DocumentListRow>[]>(() => {
    const act = (kind: DocumentDialogKind, row: DocumentListRow) => open(kind, row as DocumentSummary);
    const cols: ColumnDef<DocumentListRow>[] = [];

    if (showEmployee) {
      cols.push({
        id: 'employee',
        // accessor makes the column sortable (server-side: `sort=employee`)
        accessorFn: (r) => localized({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, 'name', locale),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.employee')} />,
        cell: ({ row }) => {
          const r = row.original;
          const department = localized({ name_ar: r.department_name_ar, name_en: r.department_name_en }, 'name', locale);
          return (
            <EmployeeCell
              size="sm"
              employee={{
                id: r.employee_id,
                name_ar: r.employee_name_ar,
                name_en: r.employee_name_en,
                avatarUrl: r.employee_avatar_path ? fileRouteUrl(BUCKETS.employeeDocuments, r.employee_avatar_path) : null,
              }}
              subtitle={
                <>
                  {r.employee_number ? <bdi className="numeric">{r.employee_number}</bdi> : null}
                  {r.employee_number && department ? ' · ' : null}
                  {department}
                </>
              }
            />
          );
        },
        enableHiding: false,
        meta: { label: t('fields.employee'), width: '15rem' },
      });
    }

    cols.push({
      id: 'document_type',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.document')} />,
      accessorFn: (r) => typeLabel(r.document_type),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <FileTypeIcon doc={r} className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <span className="truncate">{typeLabel(r.document_type)}</span>
                {r.is_confidential ? (
                  <SimpleTooltip content={t('details.confidentialNotice')}>
                    <LockIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('fields.confidential')} />
                  </SimpleTooltip>
                ) : null}
              </div>
              <div className="max-w-56 truncate text-xs text-muted-foreground" dir="auto">
                {r.file_name ?? t('details.noFile')}
              </div>
            </div>
          </div>
        );
      },
      enableHiding: false,
      meta: { label: t('fields.document'), width: showEmployee ? '15rem' : '14rem' },
    });

    cols.push({
      id: 'document_number',
      accessorKey: 'document_number',
      header: () => t('fields.documentNumber'),
      cell: ({ row }) =>
        row.original.document_number ? (
          <bdi className="numeric text-muted-foreground">{row.original.document_number}</bdi>
        ) : (
          <span className="text-faint-foreground">—</span>
        ),
      enableSorting: false,
      meta: { label: t('fields.documentNumber') },
    });

    if (variant !== 'review') {
      cols.push({
        id: 'issue_date',
        accessorKey: 'issue_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.issueDate')} />,
        cell: ({ row }) => (row.original.issue_date ? <span className="numeric">{fmt.date(row.original.issue_date)}</span> : <span className="text-faint-foreground">—</span>),
        meta: { label: t('fields.issueDate'), defaultHidden: true },
      });
    }

    cols.push({
      id: 'expiry_date',
      accessorKey: 'expiry_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.expiryDate')} />,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.expiry_date) return <span className="text-faint-foreground">—</span>;
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="numeric">{fmt.date(r.expiry_date)}</span>
            {r.status !== 'archived' && r.status !== 'rejected' ? <ExpiryBadge date={r.expiry_date} today={today} /> : null}
          </div>
        );
      },
      meta: { label: t('fields.expiryDate'), width: '9.5rem' },
    });

    if (variant !== 'review') {
      cols.push({
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.status')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge domain="document" status={r.status} size="sm" />
              {r.status === 'rejected' && r.review_note && (variant === 'own' || variant === 'profile') ? (
                <SimpleTooltip content={r.review_note}>
                  <span className="line-clamp-2 max-w-40 text-xs whitespace-normal text-danger">
                    {t('my.reasonLabel')}: <bdi>{r.review_note}</bdi>
                  </span>
                </SimpleTooltip>
              ) : null}
            </div>
          );
        },
        meta: { label: t('fields.status') },
      });
    }

    cols.push({
      id: 'created_at',
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.uploadedAt')} />,
      cell: ({ row }) => {
        const r = row.original;
        const by = r.self_uploaded ? t('details.selfUploaded') : r.uploaded_by_name;
        return (
          <div className="flex flex-col">
            <span className="numeric">{r.created_at ? fmt.date(r.created_at) : '—'}</span>
            {by && variant !== 'own' ? <span className="max-w-40 truncate text-xs text-muted-foreground">{by}</span> : null}
          </div>
        );
      },
      meta: { label: t('fields.uploadedAt'), defaultHidden: variant === 'own' },
    });

    if (variant === 'review' && permissions.access.approve) {
      cols.push({
        id: 'review',
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          const can = documentAbilities(r as DocumentSummary, permissions);
          if (!can.review) return null;
          if (can.selfReview) {
            return <span className="text-xs text-muted-foreground">{t('review.selfReview')}</span>;
          }
          return (
            <div className="flex justify-end gap-1.5" data-no-row-click>
              <Button size="sm" variant="outline" onClick={() => act('reject', r)} className="text-danger hover:text-danger">
                <XCircleIcon />
                {t('actions.reject')}
              </Button>
              <Button size="sm" onClick={() => act('approve', r)}>
                <CheckCircle2Icon />
                {t('actions.approve')}
              </Button>
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
        meta: { align: 'end', width: '14rem' },
      });
    }

    cols.push(
      actionsColumn<DocumentListRow>((r) => {
        const can = documentAbilities(r as DocumentSummary, permissions);
        const items: RowAction<DocumentListRow>[] = [
          { label: t('actions.viewDetails'), icon: EyeIcon, onSelect: () => act('details', r) },
          { label: t('actions.open'), icon: ExternalLinkIcon, onSelect: () => openFile(r), hidden: !can.hasFile },
          { label: t('actions.download'), icon: DownloadIcon, onSelect: () => openFile(r, true), hidden: !can.hasFile },
          {
            label: t('actions.approve'),
            icon: CheckCircle2Icon,
            onSelect: () => act('approve', r),
            hidden: !can.review || variant === 'review',
            disabled: can.selfReview,
            disabledReason: t('review.selfReview'),
            separatorBefore: true,
          },
          {
            label: t('actions.reject'),
            icon: XCircleIcon,
            onSelect: () => act('reject', r),
            hidden: !can.review || variant === 'review',
            disabled: can.selfReview,
            disabledReason: t('review.selfReview'),
          },
          { label: t('actions.edit'), icon: PencilIcon, onSelect: () => act('edit', r), hidden: !can.edit, separatorBefore: true },
          { label: t('actions.replace'), icon: RefreshCwIcon, onSelect: () => act('replace', r), hidden: !can.replace },
          { label: t('actions.archive'), icon: ArchiveIcon, onSelect: () => act('archive', r), hidden: !can.archive },
          { label: t('actions.restore'), icon: ArchiveRestoreIcon, onSelect: () => act('restore', r), hidden: !can.restore },
          { label: t('actions.delete'), icon: Trash2Icon, onSelect: () => act('delete', r), hidden: !can.delete, variant: 'destructive', separatorBefore: true },
          { label: t('actions.withdraw'), icon: UndoIcon, onSelect: () => act('withdraw', r), hidden: !can.withdraw, variant: 'destructive', separatorBefore: true },
        ];
        return items;
      }),
    );
    return cols;
  }, [variant, showEmployee, t, locale, fmt, typeLabel, open, permissions, today]);

  const filters = useMemo<FilterDef<DocumentListRow>[]>(() => {
    if (variant === 'review') {
      return [{ key: 'type', title: t('filters.type'), icon: FileTextIcon, options: DOCUMENT_TYPES.map((v) => ({ value: v, label: typeLabel(v) })) }];
    }
    const list: FilterDef<DocumentListRow>[] = [
      { key: 'type', title: t('filters.type'), icon: FileTextIcon, options: DOCUMENT_TYPES.map((v) => ({ value: v, label: typeLabel(v) })), accessor: (r) => r.document_type },
      { key: 'status', title: t('filters.status'), icon: CircleDotIcon, options: DOCUMENT_STATUSES.map((v) => ({ value: v, label: ts(v) })), accessor: (r) => r.status },
    ];
    if (server) list.push({ key: 'bucket', title: t('filters.bucket'), icon: CalendarClockIcon, options: bandOptions });
    return list;
  }, [variant, server, t, ts, typeLabel, bandOptions]);

  const moreFilters = useMemo<FilterDef<DocumentListRow>[] | undefined>(() => {
    if (variant !== 'center') return undefined;
    return [
      {
        key: 'department',
        title: t('filters.department'),
        icon: BuildingIcon,
        options: departments.map((d) => ({ value: d.id, label: localized(d, 'name', locale) })),
      },
      {
        key: 'confidential',
        title: t('filters.confidential'),
        icon: ShieldIcon,
        multiple: false,
        options: [
          { value: 'yes', label: t('filters.confidentialYes') },
          { value: 'no', label: t('filters.confidentialNo') },
        ],
      },
      { type: 'dateRange', key: 'created', title: t('filters.uploaded') },
    ];
  }, [variant, departments, locale, t]);

  const empty =
    variant === 'review'
      ? { icon: InboxIcon, title: t('empty.reviewTitle'), description: t('empty.reviewDescription') }
      : variant === 'own'
        ? { icon: FileStackIcon, title: t('empty.myTitle'), description: t('empty.myDescription'), action: emptyAction }
        : { icon: FileStackIcon, title: t('empty.documentsTitle'), description: t('empty.documentsDescription'), action: emptyAction };

  const reviewable = (r: DocumentListRow) => {
    const can = documentAbilities(r as DocumentSummary, permissions);
    return can.review && !can.selfReview;
  };

  return (
    <DataTable<DocumentListRow>
      tableId={`documents-${variant}`}
      mode={server ? 'server' : 'client'}
      columns={columns}
      data={rows}
      total={total}
      getRowId={(r) => r.id ?? ''}
      onRowClick={(r) => open('details', r as DocumentSummary)}
      filters={filters}
      moreFilters={moreFilters}
      searchable={variant !== 'profile' || rows.length > 8}
      searchPlaceholder={showEmployee ? t('placeholders.searchDocuments') : t('placeholders.searchMyDocuments')}
      searchText={(r) => [typeLabel(r.document_type), r.document_number, r.file_name, r.notes].filter(Boolean).join(' ')}
      exportDataset={exportEnabled ? 'documents' : undefined}
      defaultSort={{ id: 'created_at', desc: true }}
      defaultPageSize={server ? 25 : 10}
      emptyState={empty}
      maxHeight={server ? undefined : 'none'}
      pagination={server || rows.length > 10}
      renderMobileCard={(r) => (
        <MobileCard onOpen={() => open('details', r as DocumentSummary)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <FileTypeIcon doc={r} className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  {typeLabel(r.document_type)}
                  {r.is_confidential ? <LockIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {showEmployee
                    ? [localized({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, 'name', locale), r.employee_number].filter(Boolean).join(' · ')
                    : (r.file_name ?? '')}
                </div>
              </div>
            </div>
            <StatusBadge domain="document" status={r.status} size="sm" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="numeric">
              {r.expiry_date ? `${t('fields.expiryDate')}: ${fmt.date(r.expiry_date)}` : `${t('fields.uploadedAt')}: ${r.created_at ? fmt.date(r.created_at) : '—'}`}
            </span>
            {r.expiry_date && r.status !== 'archived' && r.status !== 'rejected' ? <ExpiryBadge date={r.expiry_date} today={today} /> : null}
          </div>
          {variant === 'review' && reviewable(r) ? (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 text-danger"
                onClick={(e) => (e.stopPropagation(), open('reject', r as DocumentSummary))}
              >
                {t('actions.reject')}
              </Button>
              <Button size="sm" className="flex-1" onClick={(e) => (e.stopPropagation(), open('approve', r as DocumentSummary))}>
                {t('actions.approve')}
              </Button>
            </div>
          ) : null}
        </MobileCard>
      )}
    />
  );
}

/** Tappable mobile card (the DataTable's phone layout has no row click of its own). */
export function MobileCard({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      className="-mx-4 -my-3 flex cursor-pointer flex-col gap-2 px-4 py-3 outline-none transition-colors hover:bg-subtle focus-visible:bg-subtle"
    >
      {children}
    </div>
  );
}
