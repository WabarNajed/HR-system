-- =====================================================================================================
-- M11 — dashboard_expiry_items gains an optional employee filter (the employee dashboard counts the
-- caller's own items exactly, even for HR / managers whose RLS scope is wider).
-- Replaces the 2-argument version (no overloads: PostgREST resolves RPCs by argument names).
-- =====================================================================================================

drop function if exists public.dashboard_expiry_items(int, int);

create or replace function public.dashboard_expiry_items(
  p_days int default 90,
  p_limit int default 10,
  p_employee_id uuid default null
)
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
    and (p_employee_id is null or i.employee_id = p_employee_id)
  order by i.expiry_date, i.kind, e.employee_number
  limit (select lim from params)
$$;

comment on function public.dashboard_expiry_items(int, int, uuid) is
  'M11: expired and expiring (≤ p_days) iqama, passport, contract, insurance and document items, optionally for one employee (security invoker).';

revoke execute on function public.dashboard_expiry_items(int, int, uuid) from public, anon;
grant execute on function public.dashboard_expiry_items(int, int, uuid) to authenticated;
