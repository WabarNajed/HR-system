'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AwardIcon, BanIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, FileTextIcon, InboxIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef, type RowAction } from '@/components/data-table';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { localized } from '@/lib/i18n/localized';
import { useLocale } from 'next-intl';
import type { IssuedCertificateRow } from '../types';
import { CERTIFICATE_LANGUAGES, CERTIFICATE_TYPES } from '../variables';
import { certificateDownloadUrl, certificateVerifyPath, certificateVerifyUrl, startDownload } from './certificate-links';
import { RevokeCertificateDialog } from './revoke-certificate-dialog';
import { useCertificateLabels } from './use-certificate-labels';

type Props = {
  rows: IssuedCertificateRow[];
  total: number;
  /** HR view: employee column, revoke, export, status filter. */
  hrView: boolean;
  canRevoke: boolean;
  canExport: boolean;
  requestCertificateHref?: string | null;
};

export function IssuedCertificatesTable({ rows, total, hrView, canRevoke, canExport, requestCertificateHref }: Props) {
  const t = useTranslations('certificates');
  const tc = useTranslations('common');
  const ts = useTranslations('statuses.certificate');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const labels = useCertificateLabels();
  const [revoking, setRevoking] = useState<IssuedCertificateRow | null>(null);

  const copyLink = async (row: IssuedCertificateRow) => {
    try {
      await navigator.clipboard.writeText(certificateVerifyUrl(row.certificate_number));
      toast.success(t('toast.linkCopied'));
    } catch {
      toast.error(tc('copyToClipboard'));
    }
  };

  const rowActions = (row: IssuedCertificateRow): RowAction<IssuedCertificateRow>[] => {
    const download = row.status === 'valid' || hrView ? certificateDownloadUrl(row.storage_path) : null;
    return [
      { label: t('actions.download'), icon: DownloadIcon, onSelect: () => download && startDownload(download), hidden: !download },
      { label: t('actions.openVerification'), icon: ExternalLinkIcon, onSelect: () => window.open(certificateVerifyPath(row.certificate_number), '_blank', 'noopener') },
      { label: t('actions.copyVerifyLink'), icon: CopyIcon, onSelect: () => void copyLink(row) },
      { label: t('actions.openRequest'), icon: FileTextIcon, href: row.request_id ? `/requests/${row.request_id}` : undefined, hidden: !row.request_id },
      {
        label: t('actions.revoke'),
        icon: BanIcon,
        variant: 'destructive',
        separatorBefore: true,
        hidden: !canRevoke,
        disabled: row.status !== 'valid',
        disabledReason: row.status !== 'valid' ? t('panel.revokedNote') : undefined,
        onSelect: () => setRevoking(row),
      },
    ];
  };

  const columns = useMemo<ColumnDef<IssuedCertificateRow>[]>(() => {
    const cols: ColumnDef<IssuedCertificateRow>[] = [
      {
        id: 'certificate_number',
        accessorKey: 'certificate_number',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.number')} />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-secondary-soft-foreground">
              <AwardIcon className="size-4" aria-hidden />
            </span>
            <bdi dir="ltr" className="numeric font-medium text-foreground">
              {row.original.certificate_number}
            </bdi>
          </div>
        ),
        meta: { label: t('fields.number'), sticky: true, width: '13rem' },
      },
      {
        id: 'employee',
        header: () => t('fields.employee'),
        cell: ({ row }) =>
          row.original.employee ? (
            <EmployeeCell
              employee={row.original.employee}
              subtitle={row.original.employee.employee_number ? <bdi dir="ltr">{row.original.employee.employee_number}</bdi> : null}
              href={`/employees/${row.original.employee.id}`}
              size="sm"
            />
          ) : (
            '—'
          ),
        enableSorting: false,
        meta: { label: t('fields.employee'), width: '15rem' },
      },
      {
        id: 'type',
        header: () => t('fields.type'),
        cell: ({ row }) => {
          const template = localized({ name_ar: row.original.template_name_ar, name_en: row.original.template_name_en }, 'name', locale);
          return (
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium">{labels.type(row.original.certificate_type)}</div>
              {template ? <div className="mt-0.5 truncate text-meta text-muted-foreground">{template}</div> : null}
            </div>
          );
        },
        enableSorting: false,
        meta: { label: t('fields.type') },
      },
      {
        id: 'language',
        header: () => t('fields.language'),
        cell: ({ row }) => (
          <Badge variant="outline" size="sm">
            {labels.language(row.original.language)}
          </Badge>
        ),
        enableSorting: false,
        meta: { label: t('fields.language') },
      },
      {
        id: 'addressed_to',
        header: () => t('fields.addressedTo'),
        cell: ({ row }) => <span className="line-clamp-1 text-muted-foreground">{row.original.addressed_to || '—'}</span>,
        enableSorting: false,
        meta: { label: t('fields.addressedTo'), defaultHidden: true },
      },
      {
        id: 'issue_date',
        accessorKey: 'issue_date',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('fields.issueDate')} />,
        cell: ({ row }) => <span className="numeric whitespace-nowrap">{fmt.date(row.original.issue_date)}</span>,
        meta: { label: t('fields.issueDate') },
      },
      {
        id: 'status',
        header: () => t('fields.status'),
        cell: ({ row }) => <StatusBadge domain="certificate" status={row.original.status} size="sm" />,
        enableSorting: false,
        meta: { label: t('fields.status') },
      },
      actionsColumn(rowActions),
    ];
    return hrView ? cols : cols.filter((c) => c.id !== 'employee');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hrView, canRevoke, locale, t, labels, fmt]);

  const filters: FilterDef<IssuedCertificateRow>[] = [
    { key: 'type', title: t('filters.type'), options: CERTIFICATE_TYPES.map((v) => ({ value: v, label: labels.type(v) })) },
    { key: 'language', title: t('filters.language'), options: CERTIFICATE_LANGUAGES.map((v) => ({ value: v, label: labels.language(v) })) },
  ];
  if (hrView) {
    filters.push({ key: 'status', title: t('filters.status'), options: (['valid', 'revoked'] as const).map((v) => ({ value: v, label: ts(v) })) });
  }
  const moreFilters: FilterDef<IssuedCertificateRow>[] = [{ type: 'dateRange', key: 'issued', title: t('filters.issueDate') }];

  return (
    <>
      <DataTable
        tableId={hrView ? 'certificates-issued' : 'certificates-issued-own'}
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        searchPlaceholder={t('filters.searchIssued')}
        filters={filters}
        moreFilters={moreFilters}
        exportDataset={canExport ? 'certificates' : undefined}
        defaultSort={{ id: 'created_at', desc: true }}
        emptyState={{
          icon: InboxIcon,
          title: hrView ? t('empty.issuedTitle') : t('empty.myIssuedTitle'),
          description: hrView ? t('empty.issuedDescription') : t('empty.myIssuedDescription'),
          action: requestCertificateHref ? (
            <Button asChild size="sm">
              <Link href={requestCertificateHref}>{t('requestCertificate')}</Link>
            </Button>
          ) : undefined,
        }}
        renderMobileCard={(row) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <bdi dir="ltr" className="numeric block font-semibold">
                  {row.certificate_number}
                </bdi>
                <div className="mt-0.5 truncate text-meta text-muted-foreground">{labels.type(row.certificate_type)}</div>
              </div>
              <StatusBadge domain="certificate" status={row.status} size="sm" />
            </div>
            {hrView && row.employee ? <EmployeeCell employee={row.employee} size="xs" /> : null}
            <div className="flex items-center justify-between gap-2 text-meta text-muted-foreground">
              <span className="numeric">
                {fmt.date(row.issue_date)} · {labels.language(row.language)}
              </span>
              <div className="flex items-center gap-1">
                {row.storage_path && (row.status === 'valid' || hrView) ? (
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={t('actions.download')}
                    onClick={() => {
                      const url = certificateDownloadUrl(row.storage_path);
                      if (url) startDownload(url);
                    }}
                  >
                    <DownloadIcon />
                  </Button>
                ) : null}
                <Button variant="outline" size="icon-sm" aria-label={t('actions.openVerification')} asChild>
                  <a href={certificateVerifyPath(row.certificate_number)} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        )}
      />
      <RevokeCertificateDialog certificate={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  );
}
