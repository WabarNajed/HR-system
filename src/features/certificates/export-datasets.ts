import { defineDataset, type AnyExportDataset } from '@/lib/export/types';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { ISSUED_FILTER_KEYS, ISSUED_SORTS, listIssuedForExport } from './server/queries';
import type { IssuedCertificateRow } from './types';

/**
 * Export datasets of the certificates module, served by `GET /api/export/<key>` and registered in
 * `src/lib/export/registry.ts`. `certificates` applies the same filters as the Issued tab.
 */
export const datasets: AnyExportDataset[] = [
  defineDataset<IssuedCertificateRow>({
    key: 'certificates',
    permission: 'certificates.export',
    titleKey: 'certificates.export.title',
    filterKeys: ISSUED_FILTER_KEYS,
    allowedSorts: ISSUED_SORTS,
    defaultSort: 'created_at',
    defaultDir: 'desc',
    columns: (t, { locale }) => [
      { key: 'certificate_number', header: t('certificates.fields.number'), width: 20 },
      { key: 'employee_number', header: t('certificates.fields.employeeNumber'), width: 14, value: (r) => r.employee?.employee_number ?? '' },
      { key: 'employee', header: t('certificates.fields.employee'), width: 30, value: (r) => employeeDisplayName(r.employee, locale) },
      {
        key: 'certificate_type',
        header: t('certificates.fields.type'),
        width: 26,
        value: (r) => (t.has(`enums.certificateType.${r.certificate_type}`) ? t(`enums.certificateType.${r.certificate_type}`) : r.certificate_type),
      },
      {
        key: 'template',
        header: t('certificates.fields.template'),
        width: 30,
        value: (r) => localized({ name_ar: r.template_name_ar, name_en: r.template_name_en }, 'name', locale),
      },
      {
        key: 'language',
        header: t('certificates.fields.language'),
        width: 18,
        value: (r) => (t.has(`enums.certificateLanguage.${r.language}`) ? t(`enums.certificateLanguage.${r.language}`) : r.language),
      },
      { key: 'addressed_to', header: t('certificates.fields.addressedTo'), width: 28 },
      { key: 'purpose', header: t('certificates.fields.purpose'), width: 28 },
      { key: 'issue_date', header: t('certificates.fields.issueDate'), type: 'date' },
      {
        key: 'status',
        header: t('certificates.fields.status'),
        width: 12,
        value: (r) => (t.has(`statuses.certificate.${r.status}`) ? t(`statuses.certificate.${r.status}`) : r.status),
      },
      { key: 'revoked_at', header: t('certificates.fields.revokedAt'), type: 'date' },
      { key: 'revoke_reason', header: t('certificates.fields.revokeReason'), width: 30 },
    ],
    fetchRows: (supabase, params, { limit }) => listIssuedForExport(supabase, params, limit),
    describeFilters: (params, t) => {
      const lines: string[] = [];
      const sep = t.locale === 'ar' ? '، ' : ', ';
      const f = params.filters as Record<string, string[] | undefined>;
      if (params.q) lines.push(`${t('common.search')}: ${params.q}`);
      if (f.type?.length) lines.push(`${t('certificates.fields.type')}: ${f.type.map((v) => t(`enums.certificateType.${v}`)).join(sep)}`);
      if (f.language?.length) lines.push(`${t('certificates.fields.language')}: ${f.language.map((v) => t(`enums.certificateLanguage.${v}`)).join(sep)}`);
      if (f.status?.length) lines.push(`${t('certificates.fields.status')}: ${f.status.map((v) => t(`statuses.certificate.${v}`)).join(sep)}`);
      if (f.issuedFrom?.[0] || f.issuedTo?.[0]) lines.push(`${t('certificates.fields.issueDate')}: ${f.issuedFrom?.[0] ?? '…'} – ${f.issuedTo?.[0] ?? '…'}`);
      return lines;
    },
  }),
];
