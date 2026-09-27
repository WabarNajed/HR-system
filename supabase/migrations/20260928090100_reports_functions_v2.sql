-- =====================================================================================================
-- M9 Reports — follow-up to 20260928090000_reports_functions.sql (idempotent; security invoker, RLS applies):
--  * report_employee_rows: adds `employee_id` (= id) so every employee-based row set links the same way.
--  * report_user_activity_rows: localized actor names (`actor_name_ar` / `actor_name_en`, employee name
--    first, profile name as fallback) instead of a single `actor_name`.
--  * report_summary: breakdown reports return their total under `headcount`.
-- =====================================================================================================

drop function if exists public.report_employee_rows(jsonb);
create function public.report_employee_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_id uuid,
  department_ar text,
  department_en text,
  job_title_id uuid,
  job_title_ar text,
  job_title_en text,
  location_id uuid,
  location_ar text,
  location_en text,
  manager_id uuid,
  manager_name_ar text,
  manager_name_en text,
  nationality text,
  gender text,
  employment_type text,
  employment_status text,
  joining_date date,
  probation_end_date date,
  contract_end_date date,
  termination_date date,
  company_email text,
  mobile text,
  id_type text,
  national_id text,
  iqama_expiry_date date,
  iqama_expiry_hijri text,
  passport_number text,
  passport_expiry_date date,
  tenure_years numeric,
  is_archived boolean,
  employee_id uuid
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_emp uuid[] := private.report_uuid_list(f, 'employee_ids');
  v_dept uuid[] := private.report_uuid_list(f, 'department_ids');
  v_mgr uuid[] := private.report_uuid_list(f, 'manager_ids');
  v_loc uuid[] := private.report_uuid_list(f, 'location_ids');
  v_job uuid[] := private.report_uuid_list(f, 'job_title_ids');
  v_nat text[] := private.report_text_list(f, 'nationalities');
  v_status text[] := private.report_text_list(f, 'statuses');
  v_scope text := coalesce(f ->> 'scope', 'records');
  v_date_field text := coalesce(f ->> 'date_field', 'joining_date');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_today date := private.org_today();
begin
  return query
  select
    e.id, e.employee_number, e.name_ar, e.name_en,
    e.department_id, d.name_ar, d.name_en,
    e.job_title_id, j.name_ar, j.name_en,
    e.location_id, l.name_ar, l.name_en,
    e.manager_id, m.name_ar, m.name_en,
    nullif(btrim(e.nationality), ''), e.gender, e.employment_type, e.employment_status,
    e.joining_date, e.probation_end_date, e.contract_end_date, e.termination_date,
    e.company_email, e.mobile,
    e.id_type, e.national_id, e.iqama_expiry_date, e.iqama_expiry_hijri, e.passport_number, e.passport_expiry_date,
    case when e.joining_date is not null
      then round(greatest(least(coalesce(e.termination_date, v_today), v_today) - e.joining_date, 0) / 365.25, 1)
    end,
    e.archived_at is not null,
    e.id
  from public.employees e
  left join public.departments d on d.id = e.department_id
  left join public.job_titles j on j.id = e.job_title_id
  left join public.locations l on l.id = e.location_id
  left join public.employees m on m.id = e.manager_id
  where
    (case v_scope
       when 'all' then true
       when 'leavers' then e.termination_date is not null or e.employment_status in ('resigned', 'terminated')
       when 'current' then e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
       else e.archived_at is null
     end)
    and (v_emp is null or e.id = any (v_emp))
    and (v_dept is null or e.department_id = any (v_dept))
    and (v_mgr is null or e.manager_id = any (v_mgr))
    and (v_loc is null or e.location_id = any (v_loc))
    and (v_job is null or e.job_title_id = any (v_job))
    and (v_nat is null or nullif(btrim(e.nationality), '') = any (v_nat))
    and (v_status is null or e.employment_status = any (v_status))
    and (v_from is null or (case when v_date_field = 'termination_date' then e.termination_date else e.joining_date end) >= v_from)
    and (v_to is null or (case when v_date_field = 'termination_date' then e.termination_date else e.joining_date end) <= v_to);
end;
$$;

drop function if exists public.report_user_activity_rows(jsonb);
create function public.report_user_activity_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  actor_key text,
  actor_id uuid,
  actor_email text,
  actor_name_ar text,
  actor_name_en text,
  employee_number text,
  events integer,
  logins integer,
  changes integer,
  requests integer,
  exports integer,
  active_days integer,
  top_category text,
  last_activity timestamptz
)
language sql
stable
set search_path = ''
as $$
  with ev as (
    select * from public.report_audit_events(p_filters)
  ),
  per_cat as (
    select coalesce(ev.actor_id::text, 'system') as k, ev.category, count(*) as n,
           row_number() over (partition by coalesce(ev.actor_id::text, 'system') order by count(*) desc, ev.category) as rn
    from ev
    group by 1, 2
  )
  select coalesce(ev.actor_id::text, 'system'),
         ev.actor_id,
         max(coalesce(p.email, ev.actor_email)),
         max(coalesce(nullif(e.name_ar, ''), nullif(p.full_name, ''))),
         max(coalesce(nullif(e.name_en, ''), nullif(p.full_name, ''), e.name_ar)),
         max(e.employee_number),
         count(*)::int,
         count(*) filter (where ev.action = 'auth.login')::int,
         count(*) filter (where ev.action ~ '\.(create|update|delete|archive|restore)$')::int,
         count(*) filter (where ev.category = 'requests')::int,
         count(*) filter (where ev.action like 'export.%')::int,
         count(distinct ev.event_date)::int,
         max(pc.category),
         max(ev.created_at)
  from ev
  left join public.profiles p on p.id = ev.actor_id
  left join public.employees e on e.id = p.employee_id
  left join per_cat pc on pc.k = coalesce(ev.actor_id::text, 'system') and pc.rn = 1
  group by coalesce(ev.actor_id::text, 'system'), ev.actor_id
$$;

drop function if exists public.report_summary(text, jsonb);
create function public.report_summary(p_report text, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_kpis jsonb := '{}'::jsonb;
  v_charts jsonb := '{}'::jsonb;
  v_dim text;
  v_kind text;
  v_scope text;
  v_today date := private.org_today();
  v_tz text := private.org_timezone();
begin
  case p_report
  -- ── employees ──────────────────────────────────────────────────────────────
  when 'employee-master' then
    with r as materialized (select * from public.report_employee_rows((f - 'scope') || '{"scope":"records"}'::jsonb))
    select jsonb_build_object(
             'total', (select count(*) from r),
             'active', (select count(*) from r where r.employment_status in ('active', 'probation', 'on_leave', 'suspended')),
             'probation', (select count(*) from r where r.employment_status = 'probation'),
             'departments', (select count(distinct r.department_id) from r),
             'avgTenure', (select round(avg(r.tenure_years), 1) from r where r.employment_status not in ('resigned', 'terminated'))),
           jsonb_build_object('byStatus', coalesce((
             select jsonb_agg(jsonb_build_object('key', s.k, 'value', s.n) order by s.n desc)
             from (select r.employment_status as k, count(*) as n from r group by 1) s), '[]'::jsonb))
      into v_kpis, v_charts;

  when 'headcount' then
    with r as materialized (
           select * from public.report_employee_rows((f - 'date_from' - 'date_to' - 'scope') || '{"scope":"current"}'::jsonb)),
         t as materialized (select * from public.report_headcount_trend(f))
    select jsonb_build_object(
             'headcount', (select count(*) from r),
             'active', (select count(*) from r where r.employment_status = 'active'),
             'probation', (select count(*) from r where r.employment_status = 'probation'),
             'onLeave', (select count(*) from r where r.employment_status in ('on_leave', 'suspended')),
             'joiners', (select coalesce(sum(t.joiners), 0) from t),
             'leavers', (select coalesce(sum(t.leavers), 0) from t),
             'netChange', (select coalesce(sum(t.net_change), 0) from t),
             'turnover', (select round(coalesce(sum(t.leavers), 0)::numeric / nullif(avg(t.headcount), 0), 4) from t)),
           jsonb_build_object('trend', coalesce((
             select jsonb_agg(jsonb_build_object('key', to_char(t.month, 'YYYY-MM-DD'), 'headcount', t.headcount,
                                                 'joiners', t.joiners, 'leavers', t.leavers) order by t.month)
             from t), '[]'::jsonb))
      into v_kpis, v_charts;

  when 'employees-by-department', 'employees-by-nationality', 'employees-by-job-title' then
    v_dim := case p_report
               when 'employees-by-department' then 'department'
               when 'employees-by-nationality' then 'nationality'
               else 'job_title' end;
    with b as materialized (select * from public.report_employee_breakdown(v_dim, f)),
         top as (select * from b where b.group_key <> '' order by b.headcount desc, b.label_en limit 1)
    select jsonb_build_object(
             'headcount', (select coalesce(sum(b.headcount), 0) from b),
             'groups', (select count(*) from b where b.group_key <> ''),
             'largest', (select top.headcount from top),
             'largest_ar', (select top.label_ar from top),
             'largest_en', (select top.label_en from top),
             'unassigned', (select coalesce(sum(b.headcount), 0) from b where b.group_key = '')),
           jsonb_build_object('breakdown', coalesce((
             select jsonb_agg(jsonb_build_object('key', b.group_key, 'label_ar', b.label_ar, 'label_en', b.label_en, 'value', b.headcount)
                              order by b.headcount desc, b.label_en)
             from b), '[]'::jsonb))
      into v_kpis, v_charts;

  when 'new-joiners' then
    with r as materialized (
      select * from public.report_employee_rows((f - 'scope' - 'date_field') || '{"scope":"records","date_field":"joining_date"}'::jsonb))
    select jsonb_build_object(
             'joiners', (select count(*) from r),
             'probation', (select count(*) from r where r.employment_status = 'probation'
                                                     or (r.probation_end_date is not null and r.probation_end_date >= v_today)),
             'departments', (select count(distinct r.department_id) from r),
             'stillEmployed', (select count(*) from r where r.employment_status not in ('resigned', 'terminated'))),
           jsonb_build_object('byMonth', coalesce((
             select jsonb_agg(jsonb_build_object('key', to_char(m.k, 'YYYY-MM-DD'), 'value', m.n) order by m.k)
             from (select date_trunc('month', r.joining_date)::date as k, count(*) as n from r where r.joining_date is not null group by 1) m),
             '[]'::jsonb))
      into v_kpis, v_charts;

  when 'leavers' then
    with r as materialized (
      select * from public.report_employee_rows((f - 'scope' - 'date_field') || '{"scope":"leavers","date_field":"termination_date"}'::jsonb))
    select jsonb_build_object(
             'leavers', (select count(*) from r),
             'resigned', (select count(*) from r where r.employment_status = 'resigned'),
             'terminated', (select count(*) from r where r.employment_status = 'terminated'),
             'avgTenure', (select round(avg(r.tenure_years), 1) from r)),
           jsonb_build_object('byMonth', coalesce((
             select jsonb_agg(jsonb_build_object('key', to_char(m.k, 'YYYY-MM-DD'), 'resigned', m.resigned,
                                                 'terminated', m.terminated, 'other', m.other) order by m.k)
             from (select date_trunc('month', r.termination_date)::date as k,
                          count(*) filter (where r.employment_status = 'resigned') as resigned,
                          count(*) filter (where r.employment_status = 'terminated') as terminated,
                          count(*) filter (where r.employment_status not in ('resigned', 'terminated')) as other
                   from r where r.termination_date is not null group by 1) m), '[]'::jsonb))
      into v_kpis, v_charts;

  -- ── compliance ─────────────────────────────────────────────────────────────
  when 'contract-expiry', 'iqama-expiry', 'passport-expiry', 'insurance-expiry' then
    v_kind := split_part(p_report, '-', 1);
    select jsonb_build_object(
             'total', count(*),
             'expired', count(*) filter (where x.bucket = 'expired'),
             'within30', count(*) filter (where x.bucket = 'within30'),
             'within60', count(*) filter (where x.bucket = 'within60'),
             'within90', count(*) filter (where x.bucket = 'within90'),
             'valid', count(*) filter (where x.bucket = 'valid'),
             'missing', count(*) filter (where x.bucket = 'missing')),
           jsonb_build_object('buckets', jsonb_build_array(
             jsonb_build_object('key', 'expired', 'value', count(*) filter (where x.bucket = 'expired')),
             jsonb_build_object('key', 'within30', 'value', count(*) filter (where x.bucket = 'within30')),
             jsonb_build_object('key', 'within60', 'value', count(*) filter (where x.bucket = 'within60')),
             jsonb_build_object('key', 'within90', 'value', count(*) filter (where x.bucket = 'within90')),
             jsonb_build_object('key', 'valid', 'value', count(*) filter (where x.bucket = 'valid')),
             jsonb_build_object('key', 'missing', 'value', count(*) filter (where x.bucket = 'missing'))))
      into v_kpis, v_charts
    from public.report_expiry_rows(v_kind, f) x;

  -- ── leave ──────────────────────────────────────────────────────────────────
  when 'leave-balance' then
    with b as materialized (select * from public.report_leave_balance_rows(f))
    select jsonb_build_object(
             'employees', (select count(distinct b.employee_id) from b),
             'available', (select coalesce(sum(b.total_available), 0) from b),
             'used', (select coalesce(sum(b.used), 0) from b),
             'pending', (select coalesce(sum(b.pending), 0) from b),
             'remaining', (select coalesce(sum(b.remaining), 0) from b),
             'utilization', (select round(coalesce(sum(b.used), 0) / nullif(sum(b.total_available), 0), 4) from b)),
           jsonb_build_object('byType', coalesce((
             select jsonb_agg(jsonb_build_object('key', t.id::text, 'label_ar', t.lar, 'label_en', t.len,
                                                 'used', t.used, 'pending', t.pending, 'remaining', t.remaining) order by t.sort, t.len)
             from (select b.leave_type_id as id, max(b.leave_type_ar) as lar, max(b.leave_type_en) as len, min(b.leave_type_sort) as sort,
                          sum(b.used) as used, sum(b.pending) as pending, sum(greatest(b.remaining - b.pending, 0)) as remaining
                   from b group by b.leave_type_id) t), '[]'::jsonb))
      into v_kpis, v_charts;

  when 'leave-usage' then
    with l as materialized (select * from public.report_leave_rows(f))
    select jsonb_build_object(
             'requests', (select count(*) from l),
             'daysTaken', (select coalesce(sum(l.days), 0) from l where l.is_taken),
             'daysPending', (select coalesce(sum(l.days), 0) from l where l.is_pending),
             'employees', (select count(distinct l.employee_id) from l where l.is_taken),
             'avgDays', (select round(avg(l.days), 1) from l where l.is_taken)),
           jsonb_build_object(
             'byType', coalesce((select jsonb_agg(jsonb_build_object('key', t.id::text, 'label_ar', t.lar, 'label_en', t.len, 'value', t.days) order by t.days desc)
                        from (select l.leave_type_id as id, max(l.leave_type_ar) as lar, max(l.leave_type_en) as len, sum(l.days) as days
                              from l where l.is_taken group by 1) t), '[]'::jsonb),
             'byDepartment', coalesce((select jsonb_agg(jsonb_build_object('key', coalesce(t.id::text, ''), 'label_ar', t.lar, 'label_en', t.len, 'value', t.days) order by t.days desc)
                        from (select l.department_id as id, max(l.department_ar) as lar, max(l.department_en) as len, sum(l.days) as days
                              from l where l.is_taken group by 1) t), '[]'::jsonb),
             'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', to_char(t.k, 'YYYY-MM-DD'), 'value', t.days) order by t.k)
                        from (select date_trunc('month', l.start_date)::date as k, sum(l.days) as days
                              from l where l.is_taken group by 1) t), '[]'::jsonb))
      into v_kpis, v_charts;

  -- ── requests ───────────────────────────────────────────────────────────────
  when 'hr-requests', 'open-requests', 'completed-requests', 'rejected-requests', 'overdue-requests' then
    v_scope := case p_report
                 when 'open-requests' then 'open'
                 when 'completed-requests' then 'completed'
                 when 'rejected-requests' then 'rejected'
                 when 'overdue-requests' then 'overdue'
                 else 'all' end;
    f := (f - 'scope') || jsonb_build_object('scope', v_scope);
    with r as materialized (select * from public.report_request_rows(f))
    select jsonb_build_object(
             'total', (select count(*) from r),
             'open', (select count(*) from r where r.is_open),
             'completed', (select count(*) from r where r.status in ('approved', 'completed')),
             'rejected', (select count(*) from r where r.status = 'rejected'),
             'cancelled', (select count(*) from r where r.status = 'cancelled'),
             'overdue', (select count(*) from r where r.is_overdue),
             'dueSoon', (select count(*) from r where r.sla_state = 'due_soon'),
             'pendingManager', (select count(*) from r where r.status = 'pending_manager_approval'),
             'pendingHr', (select count(*) from r where r.status = 'pending_hr_review'),
             'returned', (select count(*) from r where r.status = 'returned'),
             'avgAge', (select round(avg(r.age_days), 1) from r where r.is_open),
             'avgOverdue', (select round(avg(r.overdue_days), 1) from r where r.is_overdue),
             'maxOverdue', (select max(r.overdue_days) from r),
             'employees', (select count(distinct r.employee_id) from r),
             'onTimeRate', (select round((count(*) filter (where r.on_time))::numeric / nullif(count(*) filter (where r.on_time is not null), 0), 4) from r),
             'avgResolution', (select round(avg(r.resolution_business_days), 1) from r where r.on_time is not null)),
           jsonb_build_object(
             'byType', coalesce((select jsonb_agg(jsonb_build_object('key', t.id::text, 'label_ar', t.lar, 'label_en', t.len, 'value', t.n) order by t.n desc)
                        from (select r.request_type_id as id, max(r.type_ar) as lar, max(r.type_en) as len, count(*) as n
                              from r group by 1) t), '[]'::jsonb),
             'byStatus', coalesce((select jsonb_agg(jsonb_build_object('key', t.k, 'value', t.n) order by t.n desc)
                        from (select r.status as k, count(*) as n from r group by 1) t), '[]'::jsonb),
             'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', to_char(t.k, 'YYYY-MM-DD'), 'value', t.n) order by t.k)
                        from (select date_trunc('month', (case when v_scope in ('completed', 'rejected') then r.resolved_at else r.submitted_at end)
                                                         at time zone v_tz)::date as k, count(*) as n
                              from r
                              where (case when v_scope in ('completed', 'rejected') then r.resolved_at else r.submitted_at end) is not null
                              group by 1) t), '[]'::jsonb))
      into v_kpis, v_charts;

  when 'sla-performance' then
    with r as materialized (select * from public.report_request_rows((f - 'scope') || '{"scope":"all"}'::jsonb)),
         s as (
           select r.request_type_id, max(r.type_ar) as type_ar, max(r.type_en) as type_en,
                  count(*) filter (where r.on_time is not null) as closed,
                  count(*) filter (where r.on_time) as on_time
           from r group by r.request_type_id)
    select jsonb_build_object(
             'closed', (select count(*) from r where r.on_time is not null),
             'onTime', (select count(*) from r where r.on_time),
             'late', (select count(*) from r where r.on_time = false),
             'onTimeRate', (select round((count(*) filter (where r.on_time))::numeric / nullif(count(*) filter (where r.on_time is not null), 0), 4) from r),
             'avgResolution', (select round(avg(r.resolution_business_days), 1) from r where r.on_time is not null),
             'overdue', (select count(*) from r where r.is_overdue)),
           jsonb_build_object('byType', coalesce((
             select jsonb_agg(jsonb_build_object('key', s.request_type_id::text, 'label_ar', s.type_ar, 'label_en', s.type_en,
                                                 'value', round(s.on_time::numeric / s.closed, 4), 'closed', s.closed)
                              order by s.on_time::numeric / s.closed desc, s.type_en)
             from s where s.closed > 0), '[]'::jsonb))
      into v_kpis, v_charts;

  -- ── certificates ───────────────────────────────────────────────────────────
  when 'certificates-issued' then
    with c as materialized (select * from public.report_certificate_rows(f))
    select jsonb_build_object(
             'issued', (select count(*) from c),
             'valid', (select count(*) from c where c.status = 'valid'),
             'revoked', (select count(*) from c where c.status = 'revoked'),
             'employees', (select count(distinct c.employee_id) from c)),
           jsonb_build_object(
             'byType', coalesce((select jsonb_agg(jsonb_build_object('key', t.k, 'value', t.n) order by t.n desc)
                        from (select c.certificate_type as k, count(*) as n from c group by 1) t), '[]'::jsonb),
             'byMonth', coalesce((select jsonb_agg(jsonb_build_object('key', to_char(t.k, 'YYYY-MM-DD'), 'value', t.n) order by t.k)
                        from (select date_trunc('month', c.issue_date)::date as k, count(*) as n
                              from c where c.issue_date is not null group by 1) t), '[]'::jsonb))
      into v_kpis, v_charts;

  -- ── audit ──────────────────────────────────────────────────────────────────
  when 'user-activity' then
    with a as materialized (select * from public.report_audit_events(f))
    select jsonb_build_object(
             'events', (select count(*) from a),
             'users', (select count(distinct a.actor_id) from a),
             'logins', (select count(*) from a where a.action = 'auth.login'),
             'exports', (select count(*) from a where a.action like 'export.%'),
             'changes', (select count(*) from a where a.action ~ '\.(create|update|delete|archive|restore)$')),
           jsonb_build_object(
             'byDay', coalesce((select jsonb_agg(jsonb_build_object('key', to_char(t.k, 'YYYY-MM-DD'), 'value', t.n) order by t.k)
                       from (select a.event_date as k, count(*) as n from a group by 1) t), '[]'::jsonb),
             'byCategory', coalesce((select jsonb_agg(jsonb_build_object('key', t.k, 'value', t.n) order by t.n desc)
                       from (select a.category as k, count(*) as n from a group by 1) t), '[]'::jsonb))
      into v_kpis, v_charts;

  else
    raise exception 'hr:errors.notFound' using errcode = '22023';
  end case;

  return jsonb_build_object('kpis', coalesce(v_kpis, '{}'::jsonb), 'charts', coalesce(v_charts, '{}'::jsonb));
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.report_employee_rows(jsonb)',
    'public.report_user_activity_rows(jsonb)',
    'public.report_summary(text, jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
