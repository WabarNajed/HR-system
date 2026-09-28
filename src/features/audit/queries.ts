import 'server-only';

import type { ListParams } from '@/lib/list-params';
import { toIlikePattern } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { AUDIT_CATEGORY_PREFIXES, isAuditCategory } from './labels';

/**
 * Audit log list queries (RLS: org `audit.view`). Shared by the page and the `audit` export dataset
 * so both apply exactly the same filters.
 */

export const AUDIT_FILTER_KEYS = ['category', 'action', 'entity', 'actor', 'createdFrom', 'createdTo', 'employee'] as const;
export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];
export const AUDIT_SORTS = ['created_at', 'action', 'entity_type', 'actor_email'] as const;
export type AuditSort = (typeof AUDIT_SORTS)[number];

export type AuditListParams = ListParams<AuditSort, AuditFilterKey>;

export const AUDIT_COLUMNS = 'id, created_at, actor_id, actor_email, action, entity_type, entity_id, employee_id, summary, changes, ip, user_agent';

export type AuditRow = {
  id: number;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  employee_id: string | null;
  summary: string | null;
  changes: unknown;
  ip: string | null;
  user_agent: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

/** `yyyy-MM-dd` (organization day, Asia/Riyadh = UTC+3) → timestamptz bound. */
function dayBound(date: string, end: boolean): string {
  return `${date}T${end ? '23:59:59.999' : '00:00:00'}+03:00`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = any;

/** Applies search, filters and sorting to an `audit_logs` select builder. */
export function applyAuditFilters<Q extends Filterable>(query: Q, params: AuditListParams, options: { sort?: boolean } = {}): Q {
  let q: Filterable = query;
  const f = params.filters;

  const categories = (f.category ?? []).filter(isAuditCategory);
  if (categories.length) {
    const ors: string[] = [];
    for (const c of categories) {
      for (const prefix of AUDIT_CATEGORY_PREFIXES[c]) ors.push(`action.like.${prefix}.*`);
      if (c === 'data') ors.push('action.eq.organization.reset');
    }
    q = q.or(ors.join(','));
  }

  const actions = (f.action ?? []).filter((a) => ACTION_RE.test(a)).slice(0, 50);
  if (actions.length) q = q.in('action', actions);

  const entities = (f.entity ?? []).filter((e) => /^[a-z0-9_]+$/i.test(e)).slice(0, 50);
  if (entities.length) q = q.in('entity_type', entities);

  const actors = (f.actor ?? []).filter((a) => UUID_RE.test(a) || a === 'system').slice(0, 50);
  if (actors.length) {
    const ids = actors.filter((a) => a !== 'system');
    if (actors.includes('system')) {
      q = ids.length ? q.or(`actor_id.is.null,actor_id.in.(${ids.join(',')})`) : q.is('actor_id', null);
    } else {
      q = q.in('actor_id', ids);
    }
  }

  const employee = f.employee?.[0];
  if (employee && UUID_RE.test(employee)) q = q.eq('employee_id', employee);

  const from = f.createdFrom?.[0];
  const to = f.createdTo?.[0];
  if (from && ISO_DATE.test(from)) q = q.gte('created_at', dayBound(from, false));
  if (to && ISO_DATE.test(to)) q = q.lte('created_at', dayBound(to, true));

  const text = params.q.trim();
  if (text) {
    if (/^\d{1,18}$/.test(text)) {
      q = q.or(`id.eq.${text},summary.ilike.${toIlikePattern(text)},entity_id.ilike.${toIlikePattern(text)}`);
    } else {
      const p = toIlikePattern(text);
      q = q.or(`summary.ilike.${p},actor_email.ilike.${p},action.ilike.${p},entity_id.ilike.${p},ip.ilike.${p}`);
    }
  }

  if (options.sort !== false) {
    const sort = params.sort ?? 'created_at';
    q = q.order(sort, { ascending: params.dir === 'asc', nullsFirst: false });
    if (sort !== 'created_at') q = q.order('created_at', { ascending: false });
    q = q.order('id', { ascending: params.dir === 'asc' && sort === 'created_at' });
  }
  return q as Q;
}

export async function listAuditLogs(supabase: ServerSupabaseClient, params: AuditListParams): Promise<{ rows: AuditRow[]; total: number }> {
  const query = applyAuditFilters(supabase.from('audit_logs').select(AUDIT_COLUMNS, { count: 'exact' }), params).range(params.from, params.to);
  const { data, error, count } = await query;
  if (error && params.from > 0) {
    // Offset past the last row (stale `?page=` after narrowing the filters): PostgREST answers 416
    // (PGRST103). Report the real total so the page can send the user to the last page.
    const head = applyAuditFilters(supabase.from('audit_logs').select('id', { count: 'exact', head: true }), params, { sort: false });
    const { count: total, error: countError } = await head;
    if (!countError && (total ?? 0) <= params.from) return { rows: [], total: total ?? 0 };
  }
  if (error) throw error;
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}

export async function getAuditEvent(supabase: ServerSupabaseClient, id: number): Promise<AuditRow | null> {
  const { data, error } = await supabase.from('audit_logs').select(AUDIT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as AuditRow | null) ?? null;
}

export type AuditFacet = { facet: 'action' | 'entity_type' | 'actor'; value: string; label: string | null; total: number };

export async function getAuditFacets(supabase: ServerSupabaseClient, since?: string): Promise<AuditFacet[]> {
  const { data, error } = await supabase.rpc('audit_log_facets', since ? { p_since: since } : {});
  if (error) throw error;
  return (data ?? [])
    .filter((r) => r.value && (r.facet === 'action' || r.facet === 'entity_type' || r.facet === 'actor'))
    .map((r) => ({ facet: r.facet as AuditFacet['facet'], value: r.value as string, label: r.label ?? null, total: Number(r.total ?? 0) }));
}

export type ActorProfile = { id: string; full_name: string | null; email: string | null; employee: { id: string; name_ar: string | null; name_en: string | null } | null };

/** Display names for actor ids (HR with audit.view can read profiles; missing ones fall back to e-mail). */
export async function getActorProfiles(supabase: ServerSupabaseClient, ids: string[]): Promise<Map<string, ActorProfile>> {
  const unique = [...new Set(ids.filter((id) => UUID_RE.test(id)))].slice(0, 500);
  if (!unique.length) return new Map();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, employee:employees!profiles_employee_id_fkey(id, name_ar, name_en)')
    .in('id', unique);
  return new Map(((data ?? []) as unknown as ActorProfile[]).map((p) => [p.id, p]));
}
