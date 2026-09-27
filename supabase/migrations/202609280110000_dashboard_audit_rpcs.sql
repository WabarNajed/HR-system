-- =====================================================================================================
-- M11 — dashboards, notifications, search & audit: read-only helper RPCs
--
-- All functions are SECURITY INVOKER: RLS on the underlying tables decides which rows are counted or
-- returned, so no new access is granted. They only aggregate server-side what the caller could
-- already read row by row (keeps the dashboard and audit pages from pulling whole tables).
--
--   dashboard_employee_breakdown()          → jsonb {total, by_department[], by_nationality[]}
--   dashboard_expiry_items(p_days, p_limit) → rows of expired / expiring identity items
--   audit_log_facets(p_since)               → (facet, value, label, total) for the audit filters
--                                              and the "audit activity" dashboard widget
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Headcount breakdown (active workforce: not archived, not resigned / terminated — the same population
-- as dashboard_stats().hr.total_employees).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.dashboard_employee_breakdown()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select e.department_id,
           nullif(btrim(e.nationality), '') as nationality
    from public.employees e
    where e.archived_at is null
      and e.employment_status not in ('resigned', 'terminated')
      and (select private.is_active_user())
  ),
  by_department as (
    select b.department_id as id, d.name_ar, d.name_en, count(*) as c
    from base b
    left join public.departments d on d.id = b.department_id
    group by b.department_id, d.name_ar, d.name_en
  ),
  by_nationality as (
    select min(b.nationality) as n, count(*) as c
    from base b
    group by lower(b.nationality)
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'by_department', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name_ar', x.name_ar, 'name_en', x.name_en, 'count', x.c)
                       order by x.c desc, coalesce(x.name_ar, x.name_en))
      from by_department x), '[]'::jsonb),
    'by_nationality', coalesce((
      select jsonb_agg(jsonb_build_object('nationality', x.n, 'count', x.c) order by x.c desc, x.n nulls last)
      from by_nationality x), '[]'::jsonb)
  )
$$;

comment on function public.dashboard_employee_breakdown() is
  'M11: headcount by department and nationality (security invoker — RLS scopes the rows).';

-- ---------------------------------------------------------------------------------------------------
-- Expired / expiring identity items, soonest first (expired first). Same populations and filters as
-- dashboard_stats().hr.expiring so the list and the compliance counters agree.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.dashboard_expiry_items(p_days int default 90, p_limit int default 10)
returns table (
  kind text,
  entity_id uuid,
  employee_id uuid,
  employee_name_ar text,
  employee_name_en text,
  employee_number text,
  document_type text,
  expiry_date date,
  days_left int
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select private.org_today() as today,
           least(greatest(coalesce(p_days, 90), 0), 365) as days,
           least(greatest(coalesce(p_limit, 10), 1), 100) as lim
  ),
  items as (
    select 'iqama'::text as kind, e.id as entity_id, e.id as employee_id, e.iqama_expiry_date as expiry_date, null::text as document_type
      from public.employees e
      where e.archived_at is null and e.employment_status not in ('resigned', 'terminated') and e.iqama_expiry_date is not null
    union all
    select 'passport', e.id, e.id, e.passport_expiry_date, null
      from public.employees e
      where e.archived_at is null and e.employment_status not in ('resigned', 'terminated') and e.passport_expiry_date is not null
    union all
    select 'contract', e.id, e.id, e.contract_end_date, null
      from public.employees e
      where e.archived_at is null and e.employment_status not in ('resigned', 'terminated') and e.contract_end_date is not null
    union all
    select 'insurance', i.id, i.employee_id, i.expiry_date, null
      from public.employee_insurance i
      join public.employees e on e.id = i.employee_id
      where i.status in ('active', 'pending') and e.archived_at is null and i.expiry_date is not null
    union all
    select 'document', d.id, d.employee_id, d.expiry_date, d.document_type
      from public.employee_documents d
      join public.employees e on e.id = d.employee_id
      where d.status not in ('archived', 'rejected') and e.archived_at is null and d.expiry_date is not null
  )
  select i.kind, i.entity_id, i.employee_id, e.name_ar, e.name_en, e.employee_number, i.document_type, i.expiry_date,
         (i.expiry_date - p.today)::int
  from items i
  cross join params p
  join public.employees e on e.id = i.employee_id
  where (select private.is_active_user())
    and i.expiry_date <= p.today + p.days
  order by i.expiry_date, i.kind, e.employee_number
  limit (select lim from params)
$$;

comment on function public.dashboard_expiry_items(int, int) is
  'M11: expired and expiring (≤ p_days) iqama, passport, contract, insurance and document items (security invoker).';

-- ---------------------------------------------------------------------------------------------------
-- Audit log facets: distinct actions, entity types and actors with counts (optionally since a time).
-- security invoker → only callers allowed to read audit_logs (org audit.view) get rows.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.audit_log_facets(p_since timestamptz default null)
returns table (facet text, value text, label text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'action'::text, a.action, null::text, count(*)
    from public.audit_logs a
    where p_since is null or a.created_at >= p_since
    group by a.action
  union all
  select 'entity_type', a.entity_type, null, count(*)
    from public.audit_logs a
    where (p_since is null or a.created_at >= p_since) and a.entity_type is not null
    group by a.entity_type
  union all
  select 'actor', a.actor_id::text, max(a.actor_email), count(*)
    from public.audit_logs a
    where (p_since is null or a.created_at >= p_since) and a.actor_id is not null
    group by a.actor_id
$$;

comment on function public.audit_log_facets(timestamptz) is
  'M11: audit filter facets (action, entity_type, actor) with counts (security invoker — RLS applies).';

-- Supabase grants EXECUTE on new functions to anon: keep these for signed-in users only.
revoke execute on function public.dashboard_employee_breakdown() from public, anon;
revoke execute on function public.dashboard_expiry_items(int, int) from public, anon;
revoke execute on function public.audit_log_facets(timestamptz) from public, anon;
grant execute on function public.dashboard_employee_breakdown() to authenticated;
grant execute on function public.dashboard_expiry_items(int, int) to authenticated;
grant execute on function public.audit_log_facets(timestamptz) to authenticated;
