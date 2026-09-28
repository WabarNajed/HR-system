'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { BuildingIcon, FileWarningIcon, ShieldCheckIcon, UploadIcon, UserRoundIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { localized } from '@/lib/i18n/localized';
import { BUCKETS, fileRouteUrl } from '@/lib/storage';
import { REQUIRED_DOCUMENT_TYPES } from '../constants';
import type { DocumentGapRow } from '../types';
import type { DepartmentOption } from './documents-table';
import { useDocumentTypeLabel } from './labels';
import { UploadDocumentDialog } from './upload-document-dialog';

type Props = {
  rows: DocumentGapRow[];
  total: number;
  departments: DepartmentOption[];
  canUpload: boolean;
  canOpenEmployee: boolean;
};

export function MissingDocumentsTable({ rows, total, departments, canUpload, canOpenEmployee }: Props) {
  const t = useTranslations('documents');
  const tid = useTranslations('enums.idType');
  const locale = useLocale() as 'ar' | 'en';
  const typeLabel = useDocumentTypeLabel();
  const [upload, setUpload] = useState<{ employeeId: string; type: string } | null>(null);

  const columns = useMemo<ColumnDef<DocumentGapRow>[]>(
    () => [
      {
        id: 'employee',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.employee')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <EmployeeCell
              size="sm"
              employee={{
                id: r.employee_id,
                name_ar: r.employee_name_ar,
                name_en: r.employee_name_en,
                avatarUrl: r.employee_avatar_path ? fileRouteUrl(BUCKETS.employeeDocuments, r.employee_avatar_path) : null,
              }}
              subtitle={r.employee_number ? <bdi className="numeric">{r.employee_number}</bdi> : null}
            />
          );
        },
        enableHiding: false,
        meta: { label: t('fields.employee'), width: '15rem' },
      },
      {
        id: 'department',
        header: () => t('fields.department'),
        cell: ({ row }) =>
          localized({ name_ar: row.original.department_name_ar, name_en: row.original.department_name_en }, 'name', locale) || (
            <span className="text-faint-foreground">—</span>
          ),
        enableSorting: false,
        meta: { label: t('fields.department') },
      },
      {
        id: 'id_type',
        header: () => t('fields.idType'),
        cell: ({ row }) => {
          const r = row.original;
          const idType = r.id_type === 'iqama' || r.id_type === 'national_id' ? tid(r.id_type) : null;
          // The rule uses the derived Saudi / non-Saudi status (the stored nationality is free text).
          const nationality = r.is_saudi === true ? t('missing.saudi') : r.is_saudi === false ? t('missing.nonSaudi') : null;
          return (
            <div className="flex flex-col">
              <span>{idType ?? <span className="text-faint-foreground">—</span>}</span>
              {nationality ? (
                <span className="text-xs text-muted-foreground" title={r.nationality ?? undefined}>
                  {nationality}
                </span>
              ) : null}
            </div>
          );
        },
        enableSorting: false,
        meta: { label: t('fields.idType') },
      },
      {
        id: 'missing_count',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.missing')} />,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-wrap gap-1.5">
              {(r.missing_types ?? []).map((type) => (
                <Badge key={type} variant="danger" size="sm">
                  {typeLabel(type)}
                </Badge>
              ))}
              {(r.awaiting_review_types ?? []).map((type) => (
                <SimpleTooltip key={`r-${type}`} content={t('fields.awaitingReview')}>
                  <Badge variant="warning" size="sm" dot>
                    {typeLabel(type)}
                  </Badge>
                </SimpleTooltip>
              ))}
            </div>
          );
        },
        enableHiding: false,
        meta: { label: t('fields.missing'), width: '20rem' },
      },
      {
        id: 'upload',
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          const first = r.missing_types?.[0];
          if (!canUpload || !first || !r.employee_id) return null;
          return (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setUpload({ employeeId: r.employee_id!, type: first })}>
                <UploadIcon />
                {t('actions.uploadMissing')}
              </Button>
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
        meta: { align: 'end', width: '7.5rem' },
      },
      actionsColumn<DocumentGapRow>((r) => [
        { label: t('actions.openProfile'), icon: UserRoundIcon, href: `/employees/${r.employee_id}?tab=documents`, hidden: !canOpenEmployee },
        ...(r.missing_types ?? []).map((type, i) => ({
          label: `${t('actions.uploadMissing')} · ${typeLabel(type)}`,
          icon: UploadIcon,
          onSelect: () => setUpload({ employeeId: r.employee_id!, type }),
          hidden: !canUpload,
          separatorBefore: i === 0,
        })),
      ]),
    ],
    [t, tid, locale, typeLabel, canUpload, canOpenEmployee],
  );

  const filters = useMemo<FilterDef<DocumentGapRow>[]>(() => {
    const list: FilterDef<DocumentGapRow>[] = [
      {
        key: 'missing',
        title: t('filters.missing'),
        icon: FileWarningIcon,
        options: REQUIRED_DOCUMENT_TYPES.map((type) => ({ value: type, label: typeLabel(type) })),
      },
    ];
    if (departments.length) {
      list.push({
        key: 'department',
        title: t('filters.department'),
        icon: BuildingIcon,
        options: departments.map((d) => ({ value: d.id, label: localized(d, 'name', locale) })),
      });
    }
    return list;
  }, [t, typeLabel, departments, locale]);

  return (
    <>
      <DataTable<DocumentGapRow>
        tableId="documents-missing"
        mode="server"
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.employee_id ?? ''}
        rowHref={canOpenEmployee ? (r) => `/employees/${r.employee_id}?tab=documents` : undefined}
        filters={filters}
        searchPlaceholder={t('placeholders.searchMissing')}
        defaultSort={{ id: 'employee', desc: false }}
        emptyState={{ icon: ShieldCheckIcon, title: t('empty.missingTitle'), description: t('empty.missingDescription') }}
        renderMobileCard={(r) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {localized({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, 'name', locale)}
                </div>
                <div className="truncate text-xs text-muted-foreground numeric">{r.employee_number}</div>
              </div>
              {canUpload && r.missing_types?.[0] ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setUpload({ employeeId: r.employee_id!, type: r.missing_types![0]! });
                  }}
                >
                  <UploadIcon />
                  {t('actions.uploadMissing')}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(r.missing_types ?? []).map((type) => (
                <Badge key={type} variant="danger" size="sm">
                  {typeLabel(type)}
                </Badge>
              ))}
              {(r.awaiting_review_types ?? []).map((type) => (
                <Badge key={`r-${type}`} variant="warning" size="sm" dot>
                  {typeLabel(type)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      />
      {upload ? (
        <UploadDocumentDialog
          key={`${upload.employeeId}-${upload.type}`}
          open
          onOpenChange={(open) => !open && setUpload(null)}
          employeeId={upload.employeeId}
          defaultType={upload.type}
        />
      ) : null}
    </>
  );
}
