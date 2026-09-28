-- =====================================================================================================
-- M9 Reports — rows whose request type / leave type was deactivated stay in the reports.
--
-- Non-HR readers (managers, and employees through the RPCs) only see ACTIVE request_types / leave_types
-- under RLS. The row functions inner-joined those lookups, so a team member's request of a type that
-- was later deactivated silently disappeared from every request report (while `report_catalog_stats`
-- still counted it — the catalog said 24 requests, the report listed 18). The lookups are now LEFT
-- joins: the row is kept and only the type label is empty for readers who cannot see the type.
-- Idempotent (create or replace, same signatures); security invoker — RLS still decides the rows.
-- =====================================================================================================

create or replace function public.report_leave_balance_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  id uuid,
  employee_id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_ar text,
  department_en text,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_ar text,
  leave_type_en text,
  leave_type_sort integer,
  year integer,
  opening_balance numeric,
  entitlement numeric,
  adjustment numeric,
  total_available numeric,
  used numeric,
  pending numeric,
  remaining numeric,
  utilization numeric
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_year int := case when (f ->> 'year') ~ '^\d{4}$' then (f ->> 'year')::int else extract(year from private.org_today())::int end;
  v_types uuid[] := private.report_uuid_list(f, 'leave_type_ids');
begin
  return query
  select b.id, r.id, r.employee_number, r.name_ar, r.name_en, r.department_ar, r.department_en,
         t.id, t.code, t.name_ar, t.name_en, t.sort_order,
         b.year, b.opening_balance, b.entitlement, b.adjustment,
         b.opening_balance + b.entitlement + b.adjustment,
         b.used, b.pending, b.remaining,
         case when (b.opening_balance + b.entitlement + b.adjustment) > 0
           then round(b.used / (b.opening_balance + b.entitlement + b.adjustment), 4) end
  from public.leave_balances b
  join public.report_employee_rows((f - 'scope' - 'date_from' - 'date_to' - 'statuses') || '{"scope":"current"}'::jsonb) r
    on r.id = b.employee_id
  left join public.leave_types t on t.id = b.leave_type_id
  where b.year = v_year
    and (v_types is null or b.leave_type_id = any (v_types));
end;
$$;

create or replace function public.report_leave_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  id uuid,
  request_id uuid,
  request_number text,
  status text,
  employee_id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_id uuid,
  department_ar text,
  department_en text,
  leave_type_id uuid,
  leave_type_code text,
  leave_type_ar text,
  leave_type_en text,
  start_date date,
  end_date date,
  return_date date,
  days numeric,
  balance_effect text,
  submitted_at timestamptz,
  is_taken boolean,
  is_pending boolean
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_types uuid[] := private.report_uuid_list(f, 'leave_type_ids');
  v_status text[] := private.report_text_list(f, 'statuses');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
begin
  return query
  select lr.id, rq.id, rq.request_number, rq.status,
         r.id, r.employee_number, r.name_ar, r.name_en, r.department_id, r.department_ar, r.department_en,
         t.id, t.code, t.name_ar, t.name_en,
         lr.start_date, lr.end_date, lr.return_date, lr.days, lr.balance_effect, rq.submitted_at,
         rq.status in ('approved', 'in_progress', 'completed'),
         rq.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'returned')
  from public.leave_requests lr
  join public.hr_requests rq on rq.id = lr.request_id
  join public.report_employee_rows((f - 'scope' - 'date_from' - 'date_to' - 'statuses') || '{"scope":"all"}'::jsonb) r
    on r.id = lr.employee_id
  left join public.leave_types t on t.id = lr.leave_type_id
  where rq.status <> 'draft'
    and (v_types is null or lr.leave_type_id = any (v_types))
    and (v_status is null or rq.status = any (v_status))
    and (v_from is null or lr.end_date >= v_from)
    and (v_to is null or lr.start_date <= v_to);
end;
$$;

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
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_types uuid[] := private.report_uuid_list(f, 'request_type_ids');
  v_status text[] := private.report_text_list(f, 'statuses');
  v_scope text := coalesce(f ->> 'scope', 'all');
  v_date_field text := coalesce(f ->> 'date_field', 'submitted');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_emp_filter boolean := f ?| array['employee_ids', 'department_ids', 'manager_ids', 'location_ids', 'nationalities', 'job_title_ids'];
  v_emp_ids uuid[];
  v_tz text := private.org_timezone();
  v_today date := private.org_today();
  v_open text[] := array['submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'in_progress'];
begin
  if v_emp_filter then
    select coalesce(array_agg(r.id), '{}'::uuid[]) into v_emp_ids
    from public.report_employee_rows((f - 'scope' - 'date_from' - 'date_to' - 'statuses' - 'date_field') || '{"scope":"all"}'::jsonb) r;
  end if;

  return query
  with base as (
    select rq.*, rt.key as rt_key, rt.name_ar as rt_ar, rt.name_en as rt_en, rt.category as rt_category,
           rt.sla_business_days as rt_sla,
           e.employee_number as e_number, e.name_ar as e_ar, e.name_en as e_en,
           dp.name_ar as d_ar, dp.name_en as d_en,
           rq.status = any (v_open) as open_flag,
           case rq.status
             when 'completed' then rq.completed_at
             when 'approved' then fin.at
             when 'rejected' then fin.at
           end as resolved
    from public.hr_requests rq
    left join public.request_types rt on rt.id = rq.request_type_id
    left join public.employees e on e.id = rq.employee_id
    left join public.departments dp on dp.id = e.department_id
    left join lateral (
      select max(h.created_at) as at
      from public.request_history h
      where h.request_id = rq.id and h.to_status = rq.status
    ) fin on rq.status in ('approved', 'rejected')
    where rq.status <> 'draft'
      and (not v_emp_filter or rq.employee_id = any (v_emp_ids))
      and (v_types is null or rq.request_type_id = any (v_types))
      and (v_status is null or rq.status = any (v_status))
  ),
  scoped as (
    select b.*
    from base b
    where case v_scope
            when 'open' then b.open_flag
            when 'completed' then b.status in ('approved', 'completed')
            when 'rejected' then b.status = 'rejected'
            when 'overdue' then b.open_flag and b.due_at is not null and b.due_at < now()
            else true
          end
      and (v_from is null or ((case when v_date_field = 'resolved' then b.resolved else b.submitted_at end) at time zone v_tz)::date >= v_from)
      and (v_to is null or ((case when v_date_field = 'resolved' then b.resolved else b.submitted_at end) at time zone v_tz)::date <= v_to)
  ),
  -- Business-day index over the span of the resolved rows only (cumulative count of business days),
  -- so resolution time = idx(resolved) - idx(submitted) without a per-row series.
  cal as materialized (
    select d::date as day,
           sum(case when private.is_business_day(d::date) then 1 else 0 end) over (order by d) as idx
    from generate_series(
      (select coalesce(greatest(min((x.submitted_at at time zone v_tz)::date), v_today - 3650), v_today) - 1
         from scoped x where x.resolved is not null),
      (select coalesce(max((x.resolved at time zone v_tz)::date), v_today) + 1
         from scoped x where x.resolved is not null),
      interval '1 day') as d
  )
  select s.id, s.request_number, s.title, s.request_type_id, s.rt_key, s.rt_ar, s.rt_en, s.rt_category,
         s.status, s.priority, s.current_step_type,
         s.employee_id, s.e_number, s.e_ar, s.e_en, s.d_ar, s.d_en,
         s.submitted_at, s.due_at, s.resolved, s.rt_sla,
         s.open_flag,
         s.open_flag and s.due_at is not null and s.due_at < now(),
         case when s.resolved is not null and s.due_at is not null and s.status in ('approved', 'completed', 'rejected')
           then s.resolved <= s.due_at end,
         case
           when s.due_at is null then null
           when s.open_flag and s.due_at < now() then 'overdue'
           when s.open_flag and s.due_at < now() + interval '24 hours' then 'due_soon'
           when s.open_flag then 'on_track'
           when s.resolved is not null and s.status in ('approved', 'completed', 'rejected') then
             case when s.resolved <= s.due_at then 'met' else 'missed' end
         end,
         case when s.submitted_at is not null
           then (coalesce(case when s.open_flag then null else s.resolved end, now()) at time zone v_tz)::date
                - (s.submitted_at at time zone v_tz)::date end,
         case when s.open_flag and s.due_at is not null and s.due_at < now()
           then greatest(v_today - (s.due_at at time zone v_tz)::date, 0) end,
         case when s.resolved is not null and s.submitted_at is not null then
           greatest(
             coalesce((select c.idx from cal c where c.day = (s.resolved at time zone v_tz)::date), 0)
             - coalesce((select c.idx from cal c where c.day = (s.submitted_at at time zone v_tz)::date), 0),
             0)::int
         end,
         dec.approver_name,
         dec.comment
  from scoped s
  left join lateral (
    select a.approver_name, a.comment
    from public.request_approvals a
    where a.request_id = s.id and a.decision = 'rejected'
    order by a.decided_at desc nulls last
    limit 1
  ) dec on s.status = 'rejected';
end;
$$;
