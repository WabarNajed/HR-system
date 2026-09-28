-- Reports fix: request reports time out at production volume (statement_timeout 8s on `authenticated`).
--
-- report_request_rows() backs six reports (HR / open / completed / rejected / overdue requests and,
-- through report_sla_rows(), SLA performance), their KPI summaries and their exports. At ~10k requests it
-- took 3–4.5 s per call (up to 13 s under host load) and the report page runs it twice in parallel
-- (summary + table), so the page fell into the route error boundary with SQLSTATE 57014.
--
-- Root causes and fixes (results are unchanged — verified row-for-row against the previous version):
--   1. Resolution time looked up the business-day index with two correlated sub-selects per row on a
--      materialized CTE (no index → O(rows × calendar days)). The calendar is now hash-joined.
--   2. The final decision time of approved/rejected requests was a correlated lateral per row over
--      request_history (each probe re-running that table's RLS check); it is now one grouped pass
--      restricted to the in-scope requests. The same for the rejection decision (request_approvals).
--   3. Scope filters (open / completed / rejected / overdue) are applied on hr_requests before any
--      per-row work instead of after the joins; lookups (type, employee, department) join last and only
--      the needed hr_requests columns are carried (no `rq.*`).
--   4. JIT compilation: the plans cross jit_optimize_above_cost and spent ~1.5 s compiling a query that
--      executes in milliseconds. JIT is turned off for every report function (short analytical RPCs).
--
-- Security is unchanged: still SECURITY INVOKER (RLS of the caller applies to every table read),
-- same signature, same grants (authenticated only).

create or replace function public.report_request_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  id uuid,
  request_number text,
  title text,
  request_type_id uuid,
  request_type_key text,
  type_ar text,
  type_en text,
  category text,
  status text,
  priority text,
  current_step_type text,
  employee_id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_ar text,
  department_en text,
  submitted_at timestamptz,
  due_at timestamptz,
  resolved_at timestamptz,
  sla_business_days integer,
  is_open boolean,
  is_overdue boolean,
  on_time boolean,
  sla_state text,
  age_days integer,
  overdue_days integer,
  resolution_business_days integer,
  decision_by text,
  decision_comment text
)
language plpgsql
stable
set search_path = ''
set jit = off
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_types uuid[] := private.report_uuid_list(f, 'request_type_ids');
  v_status text[] := private.report_text_list(f, 'statuses');
  v_scope text := coalesce(f ->> 'scope', 'all');
  v_resolved_dates boolean := coalesce(f ->> 'date_field', 'submitted') = 'resolved';
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_emp_filter boolean := f ?| array['employee_ids', 'department_ids', 'manager_ids', 'location_ids', 'nationalities', 'job_title_ids'];
  v_emp_ids uuid[];
  v_tz text := private.org_timezone();
  v_today date := private.org_today();
  v_now timestamptz := now();
  v_open text[] := array['submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'in_progress'];
begin
  if v_emp_filter then
    select coalesce(array_agg(r.id), '{}'::uuid[]) into v_emp_ids
    from public.report_employee_rows((f - 'scope' - 'date_from' - 'date_to' - 'statuses' - 'date_field') || '{"scope":"all"}'::jsonb) r;
  end if;

  return query
  with base as materialized (
    -- Scope + list filters are applied on hr_requests directly (index-friendly), before any per-row work.
    select rq.id, rq.request_number, rq.title, rq.request_type_id, rq.status, rq.priority, rq.current_step_type,
           rq.employee_id, rq.submitted_at, rq.due_at, rq.completed_at,
           rq.status = any (v_open) as open_flag
    from public.hr_requests rq
    where rq.status <> 'draft'
      and (not v_emp_filter or rq.employee_id = any (v_emp_ids))
      and (v_types is null or rq.request_type_id = any (v_types))
      and (v_status is null or rq.status = any (v_status))
      and case v_scope
            when 'open' then rq.status = any (v_open)
            when 'completed' then rq.status in ('approved', 'completed')
            when 'rejected' then rq.status = 'rejected'
            when 'overdue' then rq.status = any (v_open) and rq.due_at < v_now
            else true
          end
  ),
  -- Final decision time of approved/rejected requests: one grouped pass over their history rows
  -- (hash/merge joined) instead of a correlated lookup per row.
  fin as (
    select h.request_id, h.to_status, max(h.created_at) as at
    from public.request_history h
    where h.to_status in ('approved', 'rejected')
      and h.request_id in (select b.id from base b where b.status in ('approved', 'rejected'))
    group by h.request_id, h.to_status
  ),
  scoped as materialized (
    select b.*,
           case b.status
             when 'completed' then b.completed_at
             when 'approved' then fin.at
             when 'rejected' then fin.at
           end as resolved
    from base b
    left join fin on fin.request_id = b.id and fin.to_status = b.status
  ),
  dated as materialized (
    select s.*,
           (s.submitted_at at time zone v_tz)::date as submitted_day,
           (s.resolved at time zone v_tz)::date as resolved_day
    from scoped s
    where (v_from is null or ((case when v_resolved_dates then s.resolved else s.submitted_at end) at time zone v_tz)::date >= v_from)
      and (v_to is null or ((case when v_resolved_dates then s.resolved else s.submitted_at end) at time zone v_tz)::date <= v_to)
  ),
  -- Business-day index over the span of the resolved rows only (cumulative count of business days),
  -- so resolution time = idx(resolved) - idx(submitted); hash-joined below (no per-row scan).
  span as (
    select coalesce(greatest(min(x.submitted_day), v_today - 3650), v_today) - 1 as lo,
           coalesce(max(x.resolved_day), v_today) + 1 as hi
    from dated x
    where x.resolved is not null
  ),
  cal as materialized (
    select d::date as day,
           sum(case when private.is_business_day(d::date) then 1 else 0 end) over (order by d) as idx
    from span, generate_series(span.lo, span.hi, interval '1 day') as d
  ),
  dec as (
    select distinct on (a.request_id) a.request_id, a.approver_name, a.comment
    from public.request_approvals a
    where a.decision = 'rejected'
      and a.request_id in (select x.id from dated x where x.status = 'rejected')
    order by a.request_id, a.decided_at desc nulls last
  )
  select s.id, s.request_number, s.title, s.request_type_id, rt.key, rt.name_ar, rt.name_en, rt.category,
         s.status, s.priority, s.current_step_type,
         s.employee_id, e.employee_number, e.name_ar, e.name_en, dp.name_ar, dp.name_en,
         s.submitted_at, s.due_at, s.resolved, rt.sla_business_days,
         s.open_flag,
         s.open_flag and s.due_at is not null and s.due_at < v_now,
         case when s.resolved is not null and s.due_at is not null and s.status in ('approved', 'completed', 'rejected')
           then s.resolved <= s.due_at end,
         case
           when s.due_at is null then null
           when s.open_flag and s.due_at < v_now then 'overdue'
           when s.open_flag and s.due_at < v_now + interval '24 hours' then 'due_soon'
           when s.open_flag then 'on_track'
           when s.resolved is not null and s.status in ('approved', 'completed', 'rejected') then
             case when s.resolved <= s.due_at then 'met' else 'missed' end
         end,
         case when s.submitted_at is not null
           then (coalesce(case when s.open_flag then null else s.resolved end, v_now) at time zone v_tz)::date
                - s.submitted_day end,
         case when s.open_flag and s.due_at is not null and s.due_at < v_now
           then greatest(v_today - (s.due_at at time zone v_tz)::date, 0) end,
         case when s.resolved is not null and s.submitted_at is not null then
           greatest(coalesce(cr.idx, 0) - coalesce(cs.idx, 0), 0)::int
         end,
         dec.approver_name,
         dec.comment
  from dated s
  left join public.request_types rt on rt.id = s.request_type_id
  left join public.employees e on e.id = s.employee_id
  left join public.departments dp on dp.id = e.department_id
  left join cal cr on s.resolved is not null and cr.day = s.resolved_day
  left join cal cs on s.resolved is not null and cs.day = s.submitted_day
  left join dec on s.status = 'rejected' and dec.request_id = s.id;
end;
$$;

revoke execute on function public.report_request_rows(jsonb) from public, anon;
grant execute on function public.report_request_rows(jsonb) to authenticated;

-- JIT off for all report RPCs (compilation dominated their run time; they are short, parallel reads).
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'report\_%' and p.prokind = 'f'
  loop
    execute format('alter function %s set jit = off', fn);
  end loop;
end;
$$;
