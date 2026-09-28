import 'server-only';

import { slaStatus, todayIso } from '@/lib/dates';
import type { ListParams } from '@/lib/list-params';
import { toIlikePattern } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type {
  CertificateKpis,
  CertificateRequestRow,
  IssuedCertificateRow,
  TemplateDetail,
  TemplateDraft,
  TemplateListItem,
  TemplateStatus,
  TemplateVersion,
} from '../types';
import { isCertificateLanguage, type CertificateLanguage, type CertificateType } from '../variables';
import type { TemplateContent } from './document';

/* ─── Constants shared with pages & exports ───────────────────────────────── */

export const ISSUED_SORTS = ['certificate_number', 'issue_date', 'created_at'] as const;
export const ISSUED_FILTER_KEYS = ['type', 'language', 'status', 'issuedFrom', 'issuedTo'] as const;
export const REQUEST_SORTS = ['created_at', 'request_number', 'due_at', 'status'] as const;
export const REQUEST_FILTER_KEYS = ['status', 'type', 'createdFrom', 'createdTo'] as const;

/** Certificate requests HR still has to fulfil. */
export const AWAITING_STATUSES = ['pending_hr_review', 'approved', 'in_progress'] as const;
/** Request statuses in which a certificate may be issued (mirrors `issue_certificate`). */
export const ISSUABLE_STATUSES = ['pending_hr_review', 'approved', 'in_progress', 'completed'] as const;

/* ─── Templates ───────────────────────────────────────────────────────────── */

const TEMPLATE_LIST_COLUMNS =
  'id, key, certificate_type, variant, name_ar, name_en, language, is_active, is_default, current_version, published_version, published_at, updated_at';

type TemplateRow = {
  id: string;
  key: string;
  certificate_type: string;
  variant: string;
  name_ar: string;
  name_en: string;
  language: string;
  is_active: boolean;
  is_default: boolean;
  current_version: number;
  published_version: number | null;
  published_at: string | null;
  updated_at: string;
};

export function templateStatus(row: { is_active: boolean; published_version: number | null }): TemplateStatus {
  if (row.published_version === null) return 'draft';
  return row.is_active ? 'published' : 'inactive';
}

function toListItem(row: TemplateRow, lastEditor: string | null, issued: number): TemplateListItem {
  return {
    ...row,
    certificate_type: row.certificate_type as CertificateType,
    language: (isCertificateLanguage(row.language) ? row.language : 'bilingual') as CertificateLanguage,
    status: templateStatus(row),
    has_unpublished_changes: row.published_version !== null && row.current_version > row.published_version,
    last_editor: lastEditor,
    issued_count: issued,
  };
}

type VersionRow = {
  template_id: string;
  version: number;
  change_notes: string | null;
  changed_at: string;
  changer: { full_name: string | null; email: string | null } | null;
};

function changerName(v: VersionRow | undefined): string | null {
  if (!v?.changer) return null;
  return v.changer.full_name?.trim() || v.changer.email || null;
}

/**
 * All templates with their latest editor and usage count — one round trip (embedded per-template
 * `limit 1` on versions + aggregate count on certificates; RLS applies to both).
 */
export async function listTemplates(supabase: ServerSupabaseClient): Promise<TemplateListItem[]> {
  const { data, error } = await supabase
    .from('certificate_templates')
    .select(`${TEMPLATE_LIST_COLUMNS}, issued:certificates(count), latest:certificate_template_versions(template_id, version, change_notes, changed_at, changer:profiles(full_name, email))`)
    .order('version', { referencedTable: 'latest', ascending: false })
    .limit(1, { referencedTable: 'latest' })
    .order('certificate_type')
    .order('is_default', { ascending: false })
    .order('name_en');
  if (error) throw error;
  type Row = TemplateRow & { issued: { count: number }[] | null; latest: VersionRow[] | null };
  return ((data ?? []) as unknown as Row[]).map(({ issued, latest, ...row }) =>
    toListItem(row, changerName(latest?.[0]), issued?.[0]?.count ?? 0),
  );
}

export async function getTemplateDetail(supabase: ServerSupabaseClient, id: string): Promise<TemplateDetail | null> {
  const { data, error } = await supabase
    .from('certificate_templates')
    .select(`${TEMPLATE_LIST_COLUMNS}, content_ar, content_en, header_html, footer_html, show_logo, show_stamp, show_signature, show_qr`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [{ data: versions }, { count }] = await Promise.all([
    supabase
      .from('certificate_template_versions')
      .select('template_id, version, change_notes, changed_at, snapshot, changer:profiles(full_name, email)')
      .eq('template_id', id)
      .order('version', { ascending: false })
      .limit(100),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('template_id', id),
  ]);
  const vrows = (versions ?? []) as unknown as (VersionRow & { snapshot: Partial<TemplateDraft> })[];
  const row = data as TemplateRow & Omit<TemplateDraft, 'certificate_type' | 'language' | 'name_ar' | 'name_en' | 'variant'>;
  const list = toListItem(row, changerName(vrows[0]), count ?? 0);
  return {
    ...list,
    content_ar: row.content_ar ?? '',
    content_en: row.content_en ?? '',
    header_html: row.header_html ?? '',
    footer_html: row.footer_html ?? '',
    show_logo: row.show_logo,
    show_stamp: row.show_stamp,
    show_signature: row.show_signature,
    show_qr: row.show_qr,
    versions: vrows.map<TemplateVersion>((v) => ({
      version: v.version,
      change_notes: v.change_notes,
      changed_at: v.changed_at,
      changed_by_name: changerName(v),
      snapshot: v.snapshot ?? {},
    })),
  };
}

/** Active, published templates offered when issuing. */
export type IssuableTemplate = {
  id: string;
  certificate_type: CertificateType;
  variant: string;
  name_ar: string;
  name_en: string;
  language: CertificateLanguage;
  is_default: boolean;
  published_version: number;
};

export async function listIssuableTemplates(supabase: ServerSupabaseClient): Promise<IssuableTemplate[]> {
  const { data, error } = await supabase
    .from('certificate_templates')
    .select('id, certificate_type, variant, name_ar, name_en, language, is_default, published_version')
    .eq('is_active', true)
    .not('published_version', 'is', null)
    .order('is_default', { ascending: false })
    .order('name_en');
  if (error) throw error;
  return (data ?? []) as IssuableTemplate[];
}

/** The published snapshot of a template (what certificates are issued from). */
export async function loadPublishedTemplate(
  supabase: ServerSupabaseClient,
  templateId: string,
): Promise<{ id: string; version: number; language: CertificateLanguage; content: TemplateContent } | null> {
  const { data: tpl } = await supabase
    .from('certificate_templates')
    .select('id, is_active, published_version, certificate_type, language, name_ar, name_en')
    .eq('id', templateId)
    .maybeSingle();
  if (!tpl || !tpl.is_active || tpl.published_version === null) return null;
  const { data: version } = await supabase
    .from('certificate_template_versions')
    .select('snapshot')
    .eq('template_id', templateId)
    .eq('version', tpl.published_version)
    .maybeSingle();
  if (!version) return null;
  const s = (version.snapshot ?? {}) as Partial<TemplateContent>;
  const language = (isCertificateLanguage(s.language) ? s.language : tpl.language) as CertificateLanguage;
  return {
    id: tpl.id,
    version: tpl.published_version,
    language,
    content: {
      name_ar: s.name_ar ?? tpl.name_ar,
      name_en: s.name_en ?? tpl.name_en,
      certificate_type: tpl.certificate_type,
      language,
      content_ar: s.content_ar ?? null,
      content_en: s.content_en ?? null,
      header_html: s.header_html ?? null,
      footer_html: s.footer_html ?? null,
      show_logo: s.show_logo ?? true,
      show_stamp: s.show_stamp ?? true,
      show_signature: s.show_signature ?? true,
      show_qr: s.show_qr ?? true,
    },
  };
}

/* ─── Issued certificates ─────────────────────────────────────────────────── */

const ISSUED_COLUMNS =
  'id, certificate_number, employee_id, request_id, certificate_type, language, addressed_to, purpose, issue_date, status, storage_path, verification_code, revoked_at, revoke_reason, created_at, employee:employees(id, employee_number, name_ar, name_en), template:certificate_templates(name_ar, name_en)';

type RawIssued = Omit<IssuedCertificateRow, 'template_name_ar' | 'template_name_en'> & {
  template: { name_ar: string | null; name_en: string | null } | null;
};

function toIssuedRow(raw: RawIssued): IssuedCertificateRow {
  const { template, ...rest } = raw;
  return { ...rest, template_name_ar: template?.name_ar ?? null, template_name_en: template?.name_en ?? null };
}

async function employeeIdsMatching(supabase: ServerSupabaseClient, q: string): Promise<string[]> {
  const { data } = await supabase.from('employees').select('id').ilike('search_text', toIlikePattern(q.toLowerCase())).limit(300);
  return (data ?? []).map((r) => r.id as string);
}

type IssuedQueryOptions = { employeeId?: string; requestId?: string };

/**
 * Applies the Issued-tab filters. Synchronous on purpose: PostgREST builders are thenables, so returning
 * one from an async function would execute it. Resolve `employeeIds` (search) first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyIssuedFilters(query: any, params: ListParams, opts: IssuedQueryOptions, employeeIds: string[] | null) {
  let q = query;
  const f = params.filters as Record<string, string[] | undefined>;
  if (opts.employeeId) q = q.eq('employee_id', opts.employeeId);
  if (opts.requestId) q = q.eq('request_id', opts.requestId);
  if (f.type?.length) q = q.in('certificate_type', f.type);
  if (f.language?.length) q = q.in('language', f.language);
  if (f.status?.length) q = q.in('status', f.status);
  if (f.issuedFrom?.[0]) q = q.gte('issue_date', f.issuedFrom[0]);
  if (f.issuedTo?.[0]) q = q.lte('issue_date', f.issuedTo[0]);
  if (params.q) {
    const numberFilter = `certificate_number.ilike.${toIlikePattern(params.q.toUpperCase())}`;
    q = employeeIds?.length ? q.or(`${numberFilter},employee_id.in.(${employeeIds.join(',')})`) : q.or(numberFilter);
  }
  const sort = params.sort ?? 'created_at';
  q = q.order(sort, { ascending: params.dir === 'asc' });
  if (sort !== 'created_at') q = q.order('created_at', { ascending: false });
  return q;
}

export async function listIssuedCertificates(
  supabase: ServerSupabaseClient,
  params: ListParams,
  opts: IssuedQueryOptions = {},
): Promise<{ rows: IssuedCertificateRow[]; total: number }> {
  const employeeIds = params.q ? await employeeIdsMatching(supabase, params.q) : null;
  const query = applyIssuedFilters(supabase.from('certificates').select(ISSUED_COLUMNS, { count: 'exact' }), params, opts, employeeIds);
  const { data, count, error } = await query.range(params.from, params.to);
  if (error) throw error;
  return { rows: ((data ?? []) as RawIssued[]).map(toIssuedRow), total: count ?? 0 };
}

export async function listIssuedForExport(
  supabase: ServerSupabaseClient,
  params: ListParams,
  limit: number,
): Promise<IssuedCertificateRow[]> {
  const out: IssuedCertificateRow[] = [];
  const employeeIds = params.q ? await employeeIdsMatching(supabase, params.q) : null;
  for (let from = 0; from < limit; from += 1000) {
    const to = Math.min(from + 1000, limit) - 1;
    const query = applyIssuedFilters(supabase.from('certificates').select(ISSUED_COLUMNS), params, {}, employeeIds);
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const rows = ((data ?? []) as RawIssued[]).map(toIssuedRow);
    out.push(...rows);
    if (rows.length < to - from + 1) break;
  }
  return out;
}

/** Certificates of one employee (profile tab) — RLS decides what the caller sees. */
export async function listEmployeeCertificates(supabase: ServerSupabaseClient, employeeId: string): Promise<IssuedCertificateRow[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select(ISSUED_COLUMNS)
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as RawIssued[]).map(toIssuedRow);
}

export async function listRequestCertificates(supabase: ServerSupabaseClient, requestId: string): Promise<IssuedCertificateRow[]> {
  const { data, error } = await supabase
    .from('certificates')
    .select(ISSUED_COLUMNS)
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as RawIssued[]).map(toIssuedRow);
}

/* ─── Certificate requests ────────────────────────────────────────────────── */

export async function certificateRequestTypeId(supabase: ServerSupabaseClient): Promise<string | null> {
  const { data } = await supabase.from('request_types').select('id').eq('key', 'certificate').maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

type RawRequest = {
  id: string;
  request_number: string | null;
  status: string;
  subtype: string | null;
  submitted_at: string | null;
  created_at: string;
  due_at: string | null;
  completed_at: string | null;
  employee: CertificateRequestRow['employee'];
};

function requestSla(r: { status: string; due_at: string | null; completed_at: string | null }) {
  if (!r.due_at || r.status === 'cancelled' || r.status === 'returned') return null;
  if (r.status === 'completed' || r.status === 'rejected') return slaStatus(r.due_at, r.status, { closedAt: r.completed_at });
  return slaStatus(r.due_at, null);
}

export async function listCertificateRequests(
  supabase: ServerSupabaseClient,
  params: ListParams,
): Promise<{ rows: CertificateRequestRow[]; total: number }> {
  const typeId = await certificateRequestTypeId(supabase);
  if (!typeId) return { rows: [], total: 0 };
  const f = params.filters as Record<string, string[] | undefined>;
  let query = supabase
    .from('hr_requests')
    .select('id, request_number, status, subtype, submitted_at, created_at, due_at, completed_at, employee:employees(id, employee_number, name_ar, name_en)', {
      count: 'exact',
    })
    .eq('request_type_id', typeId)
    .neq('status', 'draft');
  if (f.status?.length) query = query.in('status', f.status);
  if (f.type?.length) query = query.in('subtype', f.type);
  if (f.createdFrom?.[0]) query = query.gte('created_at', `${f.createdFrom[0]}T00:00:00`);
  if (f.createdTo?.[0]) query = query.lte('created_at', `${f.createdTo[0]}T23:59:59.999`);
  if (params.q) {
    const ids = await employeeIdsMatching(supabase, params.q);
    const numberFilter = `request_number.ilike.${toIlikePattern(params.q.toUpperCase())}`;
    query = ids.length ? query.or(`${numberFilter},employee_id.in.(${ids.join(',')})`) : query.or(numberFilter);
  }
  const sort = params.sort ?? 'created_at';
  query = query.order(sort, { ascending: params.dir === 'asc', nullsFirst: false });
  const { data, count, error } = await query.range(params.from, params.to);
  if (error) throw error;
  const raw = (data ?? []) as unknown as RawRequest[];
  if (!raw.length) return { rows: [], total: count ?? 0 };

  const ids = raw.map((r) => r.id);
  const [{ data: values }, { data: certs }] = await Promise.all([
    supabase.from('hr_request_values').select('request_id, field_key, value').in('request_id', ids).in('field_key', ['language', 'addressed_to']),
    // valid only: a revoked certificate does not fulfil the request
    supabase.from('certificates').select('request_id').in('request_id', ids).eq('status', 'valid'),
  ]);
  const byRequest = new Map<string, Record<string, unknown>>();
  for (const v of values ?? []) {
    const rec = byRequest.get(v.request_id as string) ?? {};
    rec[v.field_key as string] = v.value;
    byRequest.set(v.request_id as string, rec);
  }
  const issued = new Map<string, number>();
  for (const c of certs ?? []) {
    if (c.request_id) issued.set(c.request_id as string, (issued.get(c.request_id as string) ?? 0) + 1);
  }
  return {
    total: count ?? 0,
    rows: raw.map((r) => {
      const vals = byRequest.get(r.id) ?? {};
      const language = typeof vals.language === 'string' && isCertificateLanguage(vals.language) ? vals.language : null;
      return {
        ...r,
        language,
        addressed_to: typeof vals.addressed_to === 'string' ? vals.addressed_to : null,
        issued_count: issued.get(r.id) ?? 0,
        sla: requestSla(r),
      };
    }),
  };
}

/* ─── KPIs ────────────────────────────────────────────────────────────────── */

export async function certificateKpis(supabase: ServerSupabaseClient): Promise<CertificateKpis> {
  const monthStart = `${todayIso().slice(0, 7)}-01`;
  const typeId = await certificateRequestTypeId(supabase);
  const count = (res: { count: number | null }) => res.count ?? 0;
  const [issued, valid, revoked, pending] = await Promise.all([
    supabase.from('certificates').select('id', { count: 'exact', head: true }).gte('issue_date', monthStart),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'valid'),
    supabase.from('certificates').select('id', { count: 'exact', head: true }).eq('status', 'revoked'),
    typeId
      ? supabase
          .from('hr_requests')
          .select('id', { count: 'exact', head: true })
          .eq('request_type_id', typeId)
          .in('status', [...AWAITING_STATUSES, 'submitted', 'pending_manager_approval'])
      : Promise.resolve({ count: 0 }),
  ]);
  return { issuedThisMonth: count(issued), totalValid: count(valid), revoked: count(revoked), pendingRequests: count(pending) };
}

/* ─── Request panel ───────────────────────────────────────────────────────── */

export type CertificateRequestDetail = {
  id: string;
  request_number: string | null;
  status: string;
  subtype: string | null;
  employee_id: string;
  requester_id: string | null;
  current_step_type: string | null;
  employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } | null;
  values: {
    language: CertificateLanguage | null;
    addressed_to: string | null;
    purpose: string | null;
    include_salary: boolean;
    include_allowances: boolean;
    comments: string | null;
  };
};

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 'yes' || value === 1;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The certificate request (null if missing, invisible or not a certificate request). */
export async function loadCertificateRequest(supabase: ServerSupabaseClient, requestId: string): Promise<CertificateRequestDetail | null> {
  const { data } = await supabase
    .from('hr_requests')
    .select(
      'id, request_number, status, subtype, employee_id, requester_id, current_step_type, request_type:request_types(key), employee:employees(id, employee_number, name_ar, name_en)',
    )
    .eq('id', requestId)
    .maybeSingle();
  const row = data as unknown as
    | (Omit<CertificateRequestDetail, 'values'> & { request_type: { key: string } | null })
    | null;
  if (!row || row.request_type?.key !== 'certificate') return null;
  const { data: values } = await supabase.from('hr_request_values').select('field_key, value').eq('request_id', requestId);
  const map = new Map((values ?? []).map((v) => [v.field_key as string, v.value as unknown]));
  const lang = map.get('language');
  const { request_type: _type, ...rest } = row;
  return {
    ...rest,
    values: {
      language: typeof lang === 'string' && isCertificateLanguage(lang) ? lang : null,
      addressed_to: asText(map.get('addressed_to')),
      purpose: asText(map.get('purpose')),
      include_salary: asBool(map.get('include_salary')),
      include_allowances: asBool(map.get('include_allowances')),
      comments: asText(map.get('comments')),
    },
  };
}
