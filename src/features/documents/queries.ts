import 'server-only';

import { addDays, todayIso } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { toIlikePattern, type ListParams } from '@/lib/list-params';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';
import { bandsOrFilter } from './constants';
import type { DocumentGapRow, DocumentListRow, ExpiryItemRow } from './types';

export type ListResult<T> = { rows: T[]; total: number; error: boolean };

export const DOCUMENT_COLUMNS =
  'id, employee_id, document_type, document_number, issue_date, expiry_date, status, storage_path, file_name, file_size, mime_type, notes, is_confidential, uploaded_by, created_at, updated_at, review_note, reviewed_by, reviewed_at, employee_number, employee_name_ar, employee_name_en, department_id, department_name_ar, department_name_en, employment_status, employee_avatar_path, employee_archived_at, uploaded_by_name, self_uploaded, reviewed_by_name';

export const EXPIRY_COLUMNS =
  'item_key, kind, subject, source_table, entity_id, employee_id, dependent_id, document_type, reference, is_confidential, expiry_date, employee_number, employee_name_ar, employee_name_en, id_type, department_id, department_name_ar, department_name_en, employee_avatar_path, dependent_name_ar, dependent_name_en, dependent_relationship';

const GAP_COLUMNS =
  'employee_id, employee_number, employee_name_ar, employee_name_en, department_id, department_name_ar, department_name_en, id_type, nationality, is_saudi, joining_date, employment_status, employee_avatar_path, required_types, missing_types, missing_count, awaiting_review_types';

/** Organization calendar offset (Asia/Riyadh, no DST) for date-only filters on timestamps. */
const ORG_OFFSET = '+03:00';

function addDaysIso(date: string, days: number): string {
  return addDays(date, days) ?? date;
}

function nameColumn(locale: Locale): 'employee_name_ar' | 'employee_name_en' {
  return locale === 'en' ? 'employee_name_en' : 'employee_name_ar';
}

function logError(scope: string, error: { code?: string; message?: string } | null) {
  if (error) console.error(`[documents] ${scope} failed:`, error.code, error.message);
}

/* ─── Documents ───────────────────────────────────────────────────────────── */

export type DocumentListOptions = {
  locale: Locale;
  /** Restrict to one employee (profile tab). */
  employeeId?: string;
  /** `review` = pending_review only (review queue). */
  scope?: 'all' | 'review';
};

type FilterableQuery<Q> = {
  eq(column: string, value: string | boolean): Q;
  neq(column: string, value: string): Q;
  in(column: string, values: readonly string[]): Q;
  or(filters: string): Q;
  ilike(column: string, pattern: string): Q;
  gte(column: string, value: string): Q;
  lte(column: string, value: string): Q;
};

/** Filters shared by the Document Center table and the `documents` export dataset. */
export function applyDocumentFilters<Q extends FilterableQuery<Q>>(
  query: Q,
  params: ListParams,
  options: DocumentListOptions,
): Q {
  const f = params.filters as Record<string, string[] | undefined>;
  let q = query;
  if (options.employeeId) q = q.eq('employee_id', options.employeeId);
  if (options.scope === 'review') q = q.eq('status', 'pending_review');
  else if (f.status?.length) q = q.in('status', f.status);
  else q = q.neq('status', 'archived');
  if (params.q) q = q.ilike('search_text', toIlikePattern(params.q.toLowerCase()));
  if (f.type?.length) q = q.in('document_type', f.type);
  if (f.department?.length) q = q.in('department_id', f.department);
  if (f.confidential?.length === 1) q = q.eq('is_confidential', f.confidential[0] === 'yes');
  const bands = f.bucket?.length ? bandsOrFilter(f.bucket, todayIso()) : null;
  if (bands) q = q.or(bands);
  const createdFrom = f.createdFrom?.[0];
  const createdTo = f.createdTo?.[0];
  if (createdFrom) q = q.gte('created_at', `${createdFrom}T00:00:00${ORG_OFFSET}`);
  if (createdTo) q = q.lte('created_at', `${createdTo}T23:59:59.999${ORG_OFFSET}`);
  return q;
}

export async function listDocuments(params: ListParams, options: DocumentListOptions): Promise<ListResult<DocumentListRow>> {
  const supabase = await createClient();
  let query = applyDocumentFilters(
    supabase.from('employee_document_list').select(DOCUMENT_COLUMNS, { count: 'exact' }),
    params,
    options,
  );
  const ascending = params.dir === 'asc';
  switch (params.sort) {
    case 'employee':
      query = query.order(nameColumn(options.locale), { ascending, nullsFirst: false }).order('document_type');
      break;
    case 'document_type':
    case 'status':
      query = query.order(params.sort, { ascending }).order('created_at', { ascending: false });
      break;
    case 'expiry_date':
    case 'issue_date':
      query = query.order(params.sort, { ascending, nullsFirst: false }).order('created_at', { ascending: false });
      break;
    default:
      query = query.order('created_at', { ascending: params.sort === 'created_at' ? ascending : false });
  }
  const { data, count, error } = await query.range(params.from, params.to);
  logError('listDocuments', error);
  return { rows: (data ?? []) as DocumentListRow[], total: count ?? 0, error: Boolean(error) };
}

/** Every (non-archived unless asked) document of one employee — profile tab / self-service (small sets). */
export async function listEmployeeDocuments(employeeId: string, options: { includeArchived?: boolean } = {}): Promise<ListResult<DocumentListRow>> {
  const supabase = await createClient();
  let query = supabase.from('employee_document_list').select(DOCUMENT_COLUMNS, { count: 'exact' }).eq('employee_id', employeeId);
  if (!options.includeArchived) query = query.neq('status', 'archived');
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(0, 499);
  logError('listEmployeeDocuments', error);
  return { rows: (data ?? []) as DocumentListRow[], total: count ?? 0, error: Boolean(error) };
}

/* ─── Expiry monitor ──────────────────────────────────────────────────────── */

/** Filters shared by the expiry monitor and the `expiries` export dataset. */
export function applyExpiryFilters<Q extends FilterableQuery<Q>>(query: Q, params: ListParams, options: { employeeId?: string } = {}): Q {
  const f = params.filters as Record<string, string[] | undefined>;
  let q = query;
  if (options.employeeId) q = q.eq('employee_id', options.employeeId);
  if (params.q) q = q.ilike('search_text', toIlikePattern(params.q.toLowerCase()));
  if (f.kind?.length) q = q.in('kind', f.kind);
  if (f.subject?.length) q = q.in('subject', f.subject);
  if (f.department?.length) q = q.in('department_id', f.department);
  const bands = f.bucket?.length ? bandsOrFilter(f.bucket, todayIso()) : null;
  if (bands) q = q.or(bands);
  return q;
}

export async function listExpiryItems(params: ListParams, options: { locale: Locale; employeeId?: string }): Promise<ListResult<ExpiryItemRow>> {
  const supabase = await createClient();
  let query = applyExpiryFilters(supabase.from('expiry_items').select(EXPIRY_COLUMNS, { count: 'exact' }), params, options);
  const ascending = params.dir === 'asc';
  switch (params.sort) {
    case 'employee':
      query = query.order(nameColumn(options.locale), { ascending, nullsFirst: false }).order('expiry_date');
      break;
    case 'kind':
      query = query.order('kind', { ascending }).order('expiry_date');
      break;
    default:
      query = query.order('expiry_date', { ascending: params.sort === 'expiry_date' ? ascending : true }).order('item_key');
  }
  const { data, count, error } = await query.range(params.from, params.to);
  logError('listExpiryItems', error);
  return { rows: (data ?? []) as ExpiryItemRow[], total: count ?? 0, error: Boolean(error) };
}

/** All expiry items of one employee (profile tab / self-service), soonest first. */
export async function listEmployeeExpiryItems(employeeId: string): Promise<ExpiryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expiry_items')
    .select(EXPIRY_COLUMNS)
    .eq('employee_id', employeeId)
    .order('expiry_date')
    .range(0, 199);
  logError('listEmployeeExpiryItems', error);
  return (data ?? []) as ExpiryItemRow[];
}

/* ─── Missing documents ───────────────────────────────────────────────────── */

export async function listDocumentGaps(params: ListParams, options: { locale: Locale }): Promise<ListResult<DocumentGapRow>> {
  const supabase = await createClient();
  const f = params.filters as Record<string, string[] | undefined>;
  let query = supabase.from('employee_document_gaps').select(GAP_COLUMNS, { count: 'exact' });
  if (params.q) query = query.ilike('search_text', toIlikePattern(params.q.toLowerCase()));
  if (f.missing?.length) query = query.overlaps('missing_types', f.missing);
  if (f.department?.length) query = query.in('department_id', f.department);
  const ascending = params.dir === 'asc';
  if (params.sort === 'missing_count') {
    query = query.order('missing_count', { ascending }).order(nameColumn(options.locale), { nullsFirst: false });
  } else {
    query = query.order(nameColumn(options.locale), { ascending: params.sort === 'employee' ? ascending : true, nullsFirst: false });
  }
  const { data, count, error } = await query.range(params.from, params.to);
  logError('listDocumentGaps', error);
  return { rows: (data ?? []) as DocumentGapRow[], total: count ?? 0, error: Boolean(error) };
}

export async function getEmployeeDocumentGap(employeeId: string): Promise<DocumentGapRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('employee_document_gaps').select(GAP_COLUMNS).eq('employee_id', employeeId).maybeSingle();
  logError('getEmployeeDocumentGap', error);
  return (data ?? null) as DocumentGapRow | null;
}

/* ─── KPIs ────────────────────────────────────────────────────────────────── */

export type DocumentCenterStats = {
  expiringSoon: number;
  expiringWeek: number;
  expired: number;
  missingDocuments: number;
  missingEmployees: number;
  uploadedTotal: number;
  uploadedThisMonth: number;
  pendingReview: number;
  error: boolean;
};

async function headCount(
  build: (supabase: ServerSupabaseClient) => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
  supabase: ServerSupabaseClient,
  scope: string,
): Promise<number | null> {
  const { count, error } = await build(supabase);
  logError(scope, error);
  return error ? null : (count ?? 0);
}

const ON_FILE = ['valid', 'expired'] as const;

/** HR KPI row of the Document Center (org scope — RLS decides what is counted). */
export async function getDocumentCenterStats(): Promise<DocumentCenterStats> {
  const supabase = await createClient();
  const today = todayIso();
  const in7 = addDaysIso(today, 7);
  const in30 = addDaysIso(today, 30);
  const monthStart = `${today.slice(0, 8)}01T00:00:00${ORG_OFFSET}`;

  const [expiringSoon, expiringWeek, expired, uploadedTotal, uploadedThisMonth, pendingReview, gaps] = await Promise.all([
    headCount((s) => s.from('expiry_items').select('item_key', { count: 'exact', head: true }).gte('expiry_date', today).lte('expiry_date', in30), supabase, 'kpi.expiringSoon'),
    headCount((s) => s.from('expiry_items').select('item_key', { count: 'exact', head: true }).gte('expiry_date', today).lte('expiry_date', in7), supabase, 'kpi.expiringWeek'),
    headCount((s) => s.from('expiry_items').select('item_key', { count: 'exact', head: true }).lt('expiry_date', today), supabase, 'kpi.expired'),
    // "on file" = accepted documents (pending and rejected uploads are not part of anyone's file)
    headCount((s) => s.from('employee_documents').select('id', { count: 'exact', head: true }).in('status', ON_FILE), supabase, 'kpi.uploaded'),
    headCount((s) => s.from('employee_documents').select('id', { count: 'exact', head: true }).in('status', ON_FILE).gte('created_at', monthStart), supabase, 'kpi.uploadedMonth'),
    headCount((s) => s.from('employee_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'), supabase, 'kpi.pending'),
    supabase.from('employee_document_gaps').select('missing_count').range(0, 9999),
  ]);
  logError('kpi.missing', gaps.error);
  const gapRows = (gaps.data ?? []) as { missing_count: number | null }[];
  const values = [expiringSoon, expiringWeek, expired, uploadedTotal, uploadedThisMonth, pendingReview];
  return {
    expiringSoon: expiringSoon ?? 0,
    expiringWeek: expiringWeek ?? 0,
    expired: expired ?? 0,
    missingDocuments: gapRows.reduce((sum, r) => sum + (r.missing_count ?? 0), 0),
    missingEmployees: gapRows.length,
    uploadedTotal: uploadedTotal ?? 0,
    uploadedThisMonth: uploadedThisMonth ?? 0,
    pendingReview: pendingReview ?? 0,
    error: values.some((v) => v === null) || Boolean(gaps.error),
  };
}

export type LastExpiryRun = { created_at: string; source: string; items_alerted: number; notifications_created: number } | null;

export async function getLastExpiryRun(): Promise<LastExpiryRun> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('expiry_alert_runs')
    .select('created_at, source, items_alerted, notifications_created')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  logError('getLastExpiryRun', error);
  return (data ?? null) as LastExpiryRun;
}

/* ─── Filter options ──────────────────────────────────────────────────────── */

export type DepartmentOption = { id: string; name_ar: string | null; name_en: string | null };

export async function listDepartmentOptions(): Promise<DepartmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('departments').select('id, name_ar, name_en').eq('is_active', true).order('name_ar').limit(500);
  logError('listDepartmentOptions', error);
  return (data ?? []) as DepartmentOption[];
}
