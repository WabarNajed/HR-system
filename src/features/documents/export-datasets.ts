import { todayIso } from '@/lib/dates';
import { defineDataset, fetchAllPages, type AnyExportDataset } from '@/lib/export/types';
import type { LooseTranslator } from '@/lib/i18n/translator';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { ListParams } from '@/lib/list-params';
import {
  DOCUMENT_LIST_FILTERS,
  DOCUMENT_LIST_SORTS,
  EXPIRY_LIST_FILTERS,
  EXPIRY_LIST_SORTS,
  daysLeft,
  expiryBand,
} from './constants';
import { applyDocumentFilters, applyExpiryFilters, DOCUMENT_COLUMNS, EXPIRY_COLUMNS } from './queries';
import type { DocumentListRow, ExpiryItemRow } from './types';

/**
 * Export datasets of the documents module (`GET /api/export/<key>`, registered in
 * `src/lib/export/registry.ts`). Rows are read with the user's RLS client and the page's filters.
 */

function label(t: LooseTranslator, key: string, fallback: string | null | undefined): string {
  return t.has(key) ? t(key) : (fallback ?? '');
}

function describe(params: ListParams, t: LooseTranslator, keys: Record<string, (v: string) => string>): string[] {
  const lines: string[] = [];
  const f = params.filters as Record<string, string[] | undefined>;
  for (const [key, fmt] of Object.entries(keys)) {
    const values = f[key];
    if (values?.length) lines.push(`${t(`documents.filters.${key}`)}: ${values.map(fmt).join(', ')}`);
  }
  return lines;
}

const documents = defineDataset<DocumentListRow>({
  key: 'documents',
  permission: 'documents.export',
  titleKey: 'documents.export.documents',
  filterKeys: DOCUMENT_LIST_FILTERS,
  allowedSorts: DOCUMENT_LIST_SORTS,
  defaultSort: 'created_at',
  defaultDir: 'desc',
  columns: (t, ctx) => [
    { key: 'employee_number', header: t('documents.export.employeeNumber'), width: 14 },
    { key: 'employee', header: t('documents.fields.employee'), width: 28, value: (r) => employeeDisplayName({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, ctx.locale) },
    { key: 'department', header: t('documents.fields.department'), width: 20, value: (r) => localized({ name_ar: r.department_name_ar, name_en: r.department_name_en }, 'name', ctx.locale) },
    { key: 'document_type', header: t('documents.fields.documentType'), width: 22, value: (r) => label(t, `enums.documentType.${r.document_type}`, r.document_type) },
    { key: 'document_number', header: t('documents.fields.documentNumber'), width: 18 },
    { key: 'issue_date', header: t('documents.fields.issueDate'), type: 'date' },
    { key: 'expiry_date', header: t('documents.fields.expiryDate'), type: 'date' },
    { key: 'days_left', header: t('documents.export.daysLeft'), type: 'integer', value: (r) => (r.status === 'archived' || r.status === 'rejected' ? null : daysLeft(r.expiry_date, todayIso())) },
    { key: 'status', header: t('documents.fields.status'), width: 16, value: (r) => label(t, `statuses.document.${r.status}`, r.status) },
    { key: 'is_confidential', header: t('documents.fields.confidential'), type: 'boolean' },
    { key: 'file_name', header: t('documents.export.fileName'), width: 28 },
    { key: 'uploaded_by_name', header: t('documents.fields.uploadedBy'), width: 22, value: (r) => (r.self_uploaded ? t('documents.details.uploaderEmployee') : r.uploaded_by_name) },
    { key: 'created_at', header: t('documents.fields.uploadedAt'), type: 'datetime' },
    { key: 'reviewed_by_name', header: t('documents.fields.reviewedBy'), width: 22 },
    { key: 'notes', header: t('documents.fields.notes'), width: 32 },
  ],
  fetchRows: async (supabase, params, ctx) => {
    const ascending = params.dir === 'asc';
    const nameColumn = ctx.locale === 'en' ? 'employee_name_en' : 'employee_name_ar';
    return fetchAllPages<DocumentListRow>((from, to) => {
      let query = applyDocumentFilters(supabase.from('employee_document_list').select(DOCUMENT_COLUMNS), params, { locale: ctx.locale });
      if (params.sort === 'employee') query = query.order(nameColumn, { ascending, nullsFirst: false });
      else if (params.sort && params.sort !== 'created_at') query = query.order(params.sort, { ascending, nullsFirst: false });
      query = query.order('created_at', { ascending: params.sort === 'created_at' ? ascending : false }).order('id');
      return query.range(from, to) as unknown as PromiseLike<{ data: DocumentListRow[] | null; error: unknown }>;
    }, ctx.limit);
  },
  describeFilters: (params, t) =>
    describe(params, t, {
      type: (v) => label(t, `enums.documentType.${v}`, v),
      status: (v) => label(t, `statuses.document.${v}`, v),
      bucket: (v) => label(t, `documents.bands.${v}`, v),
    }),
});

const expiries = defineDataset<ExpiryItemRow>({
  key: 'expiries',
  permission: 'documents.export',
  titleKey: 'documents.export.expiries',
  filterKeys: EXPIRY_LIST_FILTERS,
  allowedSorts: EXPIRY_LIST_SORTS,
  defaultSort: 'expiry_date',
  defaultDir: 'asc',
  columns: (t, ctx) => {
    const itemLabel = (r: ExpiryItemRow) => {
      if (r.kind === 'document') return label(t, `enums.documentType.${r.document_type}`, r.document_type);
      if (r.kind === 'iqama' && r.subject !== 'dependent' && r.id_type === 'national_id') return t('documents.expiry.kinds.nationalId');
      return label(t, `documents.expiry.kinds.${r.kind}`, r.kind);
    };
    return [
      { key: 'employee_number', header: t('documents.export.employeeNumber'), width: 14 },
      { key: 'employee', header: t('documents.fields.employee'), width: 28, value: (r) => employeeDisplayName({ name_ar: r.employee_name_ar, name_en: r.employee_name_en }, ctx.locale) },
      { key: 'department', header: t('documents.fields.department'), width: 20, value: (r) => localized({ name_ar: r.department_name_ar, name_en: r.department_name_en }, 'name', ctx.locale) },
      { key: 'item', header: t('documents.fields.item'), width: 22, value: itemLabel },
      {
        key: 'dependent',
        header: t('documents.export.dependent'),
        width: 22,
        value: (r) => (r.subject === 'dependent' ? localized({ name_ar: r.dependent_name_ar, name_en: r.dependent_name_en }, 'name', ctx.locale) : ''),
      },
      { key: 'reference', header: t('documents.fields.reference'), width: 18 },
      { key: 'expiry_date', header: t('documents.fields.expiryDate'), type: 'date' },
      { key: 'days_left', header: t('documents.export.daysLeft'), type: 'integer', value: (r) => daysLeft(r.expiry_date, todayIso()) },
      {
        key: 'band',
        header: t('documents.export.band'),
        width: 18,
        value: (r) => {
          const band = expiryBand(daysLeft(r.expiry_date, todayIso()));
          return band ? t(`documents.bands.${band}`) : '';
        },
      },
    ];
  },
  fetchRows: async (supabase, params, ctx) => {
    const ascending = params.dir === 'asc';
    const nameColumn = ctx.locale === 'en' ? 'employee_name_en' : 'employee_name_ar';
    return fetchAllPages<ExpiryItemRow>((from, to) => {
      let query = applyExpiryFilters(supabase.from('expiry_items').select(EXPIRY_COLUMNS), params);
      if (params.sort === 'employee') query = query.order(nameColumn, { ascending, nullsFirst: false });
      else if (params.sort === 'kind') query = query.order('kind', { ascending });
      query = query.order('expiry_date', { ascending: params.sort === 'expiry_date' ? ascending : true }).order('item_key');
      return query.range(from, to) as unknown as PromiseLike<{ data: ExpiryItemRow[] | null; error: unknown }>;
    }, ctx.limit);
  },
  describeFilters: (params, t) =>
    describe(params, t, {
      kind: (v) => label(t, `documents.expiry.kinds.${v}`, v),
      subject: (v) => label(t, `documents.expiry.subjects.${v}`, v),
      bucket: (v) => label(t, `documents.bands.${v}`, v),
    }),
});

export const datasets: AnyExportDataset[] = [documents, expiries];
