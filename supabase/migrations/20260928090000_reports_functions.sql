-- =====================================================================================================
-- M9 Reports — read-only reporting functions (Report Center).
--
-- Every function here is SECURITY INVOKER: it runs with the caller's privileges, so RLS decides the
-- rows (HR → organization, manager → self + direct reports / team requests, employee → own). Nothing
-- here bypasses a policy. Filters arrive as one jsonb object built and validated by the app
-- (src/features/reports/filters.ts); unknown keys are ignored and every value is re-validated here
-- (uuid / date parsing, whitelisted enums).
--
--   filter keys: date_from, date_to (yyyy-mm-dd) · employee_ids, department_ids, manager_ids,
--                location_ids, request_type_ids, leave_type_ids (uuid[]) · nationalities, statuses,
--                buckets, categories, certificate_types (text[]) · year (int) · scope, date_field (text)
--
-- Row functions (`report_*_rows`) return detail rows; the app pages them with PostgREST
-- (`.order().range()` + `count=exact`) and selects only the columns a screen shows.
-- `report_summary(report, filters)` returns the KPI values and chart series as jsonb.
-- =====================================================================================================

-- ─── Filter helpers (pure; executable by authenticated because invoker functions call them) ─────────

create or replace function private.report_uuid_list(p_filters jsonb, p_key text)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_filters -> p_key) = 'array' and jsonb_array_length(p_filters -> p_key) > 0 then
      coalesce(
        (select array_agg(distinct private.try_uuid(x)) filter (where private.try_uuid(x) is not null)
           from jsonb_array_elements_text(p_filters -> p_key) as x),
        '{}'::uuid[])
  end
$$;

create or replace function private.report_text_list(p_filters jsonb, p_key text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_filters -> p_key) = 'array' and jsonb_array_length(p_filters -> p_key) > 0 then
      coalesce(
        (select array_agg(distinct left(btrim(x), 200)) filter (where btrim(x) <> '')
           from jsonb_array_elements_text(p_filters -> p_key) as x),
        '{}'::text[])
  end
$$;

create or replace function private.report_date(p_filters jsonb, p_key text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when (p_filters ->> p_key) ~ '^\d{4}-\d{2}-\d{2}$'
     and (p_filters ->> p_key)::text between '1900-01-01' and '2200-12-31'
    then (p_filters ->> p_key)::date
  end
$$;

-- Audit action → report category (User Activity report).
create or replace function private.report_audit_category(p_action text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action like 'auth.%' then 'auth'
    when p_action like 'export.%' or p_action like 'import.%' or p_action like 'backup.%' then 'data'
    when p_action ~ '^employee(_[a-z_]+)?\.' then 'employees'
    when p_action like 'request.%' then 'requests'
    when p_action ~ '^leave_(balance|adjustment)\.' then 'leave'
    when p_action like 'certificate.%' then 'certificates'
    when p_action ~ '^(user|user_role|role|role_permission|registration|profile)\.' then 'users'
    when p_action ~ '^(organization|organization_settings|system_setting|department|job_title|location|cost_center|leave_type|public_holiday|request_type|request_field|request_workflow|request_workflow_step|certificate_template|email_template|notification_setting)\.' then 'settings'
    else 'other'
  end
$$;

revoke execute on function private.report_uuid_list(jsonb, text) from public, anon;
revoke execute on function private.report_text_list(jsonb, text) from public, anon;
revoke execute on function private.report_date(jsonb, text) from public, anon;
revoke execute on function private.report_audit_category(text) from public, anon;
grant execute on function private.report_uuid_list(jsonb, text) to authenticated;
grant execute on function private.report_text_list(jsonb, text) to authenticated;
grant execute on function private.report_date(jsonb, text) to authenticated;
grant execute on function private.report_audit_category(text) to authenticated;

-- ─── Employees ──────────────────────────────────────────────────────────────────────────────────────
-- scope: 'records' (default; not archived, any status) · 'current' (records minus resigned/terminated)
--        · 'leavers' (termination date or resigned/terminated, archived included) · 'all' (everything)
-- date_field: 'joining_date' (default) | 'termination_date' — the column date_from/date_to apply to.

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
  is_archived boolean
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
    e.archived_at is not null
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

-- Headcount at each month end (capped at today) with joiners and leavers per month, over the
-- date_from..date_to window (default: the last 12 months, max 60 months).
drop function if exists public.report_headcount_trend(jsonb);
create function public.report_headcount_trend(p_filters jsonb default '{}'::jsonb)
returns table (month date, headcount integer, joiners integer, leavers integer, net_change integer)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_today date := private.org_today();
  v_to date := least(coalesce(private.report_date(f, 'date_to'), v_today), v_today + 366);
  v_from date := coalesce(private.report_date(f, 'date_from'), (date_trunc('month', v_to) - interval '11 months')::date);
begin
  if v_from > v_to then
    v_from := v_to;
  end if;
  if v_from < (date_trunc('month', v_to) - interval '59 months')::date then
    v_from := (date_trunc('month', v_to) - interval '59 months')::date;
  end if;

  return query
  with emp as (
    select r.joining_date, r.termination_date
    from public.report_employee_rows((f - 'date_from' - 'date_to' - 'date_field') || '{"scope":"all"}'::jsonb) r
    -- Archived rows without an exit date are deletions, not leavers; a resigned/terminated employee
    -- without an exit date cannot be placed on the timeline.
    where not (r.is_archived and r.termination_date is null)
      and not (r.employment_status in ('resigned', 'terminated') and r.termination_date is null)
  ),
  months as (
    select m::date as m_start,
           least((m + interval '1 month' - interval '1 day')::date, v_today) as m_end,
           (m + interval '1 month' - interval '1 day')::date as m_last
    from generate_series(date_trunc('month', v_from), date_trunc('month', v_to), interval '1 month') as m
  )
  select
    mo.m_start,
    (select count(*)::int from emp
      where coalesce(emp.joining_date, '-infinity'::date) <= mo.m_end
        and (emp.termination_date is null or emp.termination_date > mo.m_end)),
    (select count(*)::int from emp where emp.joining_date between mo.m_start and mo.m_last),
    (select count(*)::int from emp where emp.termination_date between mo.m_start and mo.m_last),
    (select count(*)::int from emp where emp.joining_date between mo.m_start and mo.m_last)
      - (select count(*)::int from emp where emp.termination_date between mo.m_start and mo.m_last)
  from months mo
  where mo.m_start <= v_today
  order by mo.m_start;
end;
$$;

-- Current workforce grouped by one whitelisted dimension.
drop function if exists public.report_employee_breakdown(text, jsonb);
create function public.report_employee_breakdown(p_dimension text, p_filters jsonb default '{}'::jsonb)
returns table (
  group_key text,
  label_ar text,
  label_en text,
  headcount integer,
  share numeric,
  active integer,
  probation integer,
  on_leave integer,
  male integer,
  female integer,
  avg_tenure_years numeric
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
begin
  if p_dimension not in ('department', 'job_title', 'nationality', 'location', 'status', 'gender', 'employment_type') then
    raise exception 'hr:errors.validation' using errcode = '22023';
  end if;

  return query
  with base as (
    select r.*,
      case p_dimension
        when 'department' then r.department_id::text
        when 'job_title' then r.job_title_id::text
        when 'location' then r.location_id::text
        when 'nationality' then r.nationality
        when 'status' then r.employment_status
        when 'gender' then r.gender
        else r.employment_type
      end as k,
      case p_dimension
        when 'department' then r.department_ar
        when 'job_title' then r.job_title_ar
        when 'location' then r.location_ar
        when 'nationality' then r.nationality
        else null
      end as lar,
      case p_dimension
        when 'department' then r.department_en
        when 'job_title' then r.job_title_en
        when 'location' then r.location_en
        when 'nationality' then r.nationality
        else null
      end as len
    from public.report_employee_rows((f - 'scope') || '{"scope":"current"}'::jsonb) r
  ),
  g as (
    select coalesce(b.k, '') as k, max(b.lar) as lar, max(b.len) as len,
           count(*)::int as n,
           count(*) filter (where b.employment_status = 'active')::int as n_active,
           count(*) filter (where b.employment_status = 'probation')::int as n_probation,
           count(*) filter (where b.employment_status = 'on_leave')::int as n_on_leave,
           count(*) filter (where b.gender = 'male')::int as n_male,
           count(*) filter (where b.gender = 'female')::int as n_female,
           round(avg(b.tenure_years), 1) as tenure
    from base b
    group by coalesce(b.k, '')
  )
  select g.k, g.lar, g.len, g.n,
         round(g.n::numeric / nullif(sum(g.n) over (), 0), 4),
         g.n_active, g.n_probation, g.n_on_leave, g.n_male, g.n_female, g.tenure
  from g;
end;
$$;

-- Document / contract / insurance expiry rows with a bucket:
--   expired (< 0 days) · within30 · within60 · within90 · valid (> 90) · missing (no date)
-- p_kind: contract | iqama | passport | insurance.  Current workforce only.
drop function if exists public.report_expiry_rows(text, jsonb);
create function public.report_expiry_rows(p_kind text, p_filters jsonb default '{}'::jsonb)
returns table (
  row_id uuid,
  employee_id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_ar text,
  department_en text,
  job_title_ar text,
  job_title_en text,
  nationality text,
  employment_type text,
  reference text,
  provider text,
  insurance_class text,
  dependent_name_ar text,
  dependent_name_en text,
  dependent_relationship text,
  expiry_date date,
  expiry_hijri text,
  days_left integer,
  bucket text
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_buckets text[] := private.report_text_list(f, 'buckets');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_today date := private.org_today();
  v_emp_filters jsonb := (f - 'scope' - 'date_from' - 'date_to' - 'date_field') || '{"scope":"current"}'::jsonb;
begin
  if p_kind not in ('contract', 'iqama', 'passport', 'insurance') then
    raise exception 'hr:errors.validation' using errcode = '22023';
  end if;

  return query
  with src as (
    select r.id as row_id, r.id as employee_id, r.employee_number, r.name_ar, r.name_en,
           r.department_ar, r.department_en, r.job_title_ar, r.job_title_en, r.nationality, r.employment_type,
           case p_kind when 'iqama' then r.national_id when 'passport' then r.passport_number end as reference,
           null::text as provider, null::text as insurance_class,
           null::text as dependent_name_ar, null::text as dependent_name_en, null::text as dependent_relationship,
           case p_kind
             when 'contract' then r.contract_end_date
             when 'iqama' then r.iqama_expiry_date
             else r.passport_expiry_date
           end as expiry_date,
           case when p_kind = 'iqama' then r.iqama_expiry_hijri end as expiry_hijri
    from public.report_employee_rows(v_emp_filters) r
    where p_kind <> 'insurance'
      and case p_kind
            when 'contract' then r.contract_end_date is not null
            when 'iqama' then r.iqama_expiry_date is not null or r.id_type = 'iqama'
            else r.passport_expiry_date is not null or r.passport_number is not null
          end
    union all
    select i.id, r.id, r.employee_number, r.name_ar, r.name_en,
           r.department_ar, r.department_en, r.job_title_ar, r.job_title_en, r.nationality, r.employment_type,
           coalesce(i.member_number, i.policy_number), i.provider, i.class,
           dep.name_ar, dep.name_en, dep.relationship,
           i.expiry_date, null::text
    from public.employee_insurance i
    join public.report_employee_rows(v_emp_filters) r on r.id = i.employee_id
    left join public.employee_dependents dep on dep.id = i.dependent_id
    where p_kind = 'insurance'
      and coalesce(i.status, 'active') not in ('cancelled')
  ),
  b as (
    select s.*,
           (s.expiry_date - v_today)::int as dl,
           case
             when s.expiry_date is null then 'missing'
             when s.expiry_date < v_today then 'expired'
             when s.expiry_date - v_today <= 30 then 'within30'
             when s.expiry_date - v_today <= 60 then 'within60'
             when s.expiry_date - v_today <= 90 then 'within90'
             else 'valid'
           end as bk
    from src s
  )
  select b.row_id, b.employee_id, b.employee_number, b.name_ar, b.name_en,
         b.department_ar, b.department_en, b.job_title_ar, b.job_title_en, b.nationality, b.employment_type,
         b.reference, b.provider, b.insurance_class, b.dependent_name_ar, b.dependent_name_en, b.dependent_relationship,
         b.expiry_date, b.expiry_hijri, b.dl, b.bk
  from b
  where (v_buckets is null or b.bk = any (v_buckets))
    and (v_from is null or b.expiry_date >= v_from)
    and (v_to is null or b.expiry_date <= v_to);
end;
$$;

-- ─── Leave ──────────────────────────────────────────────────────────────────────────────────────────

drop function if exists public.report_leave_balance_rows(jsonb);
create function public.report_leave_balance_rows(p_filters jsonb default '{}'::jsonb)
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
  join public.leave_types t on t.id = b.leave_type_id
  where b.year = v_year
    and (v_types is null or b.leave_type_id = any (v_types));
end;
$$;

-- Leave requests (not drafts) overlapping date_from..date_to.
drop function if exists public.report_leave_rows(jsonb);
create function public.report_leave_rows(p_filters jsonb default '{}'::jsonb)
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
  join public.leave_types t on t.id = lr.leave_type_id
  where rq.status <> 'draft'
    and (v_types is null or lr.leave_type_id = any (v_types))
    and (v_status is null or rq.status = any (v_status))
    and (v_from is null or lr.end_date >= v_from)
    and (v_to is null or lr.start_date <= v_to);
end;
$$;

-- ─── Requests ───────────────────────────────────────────────────────────────────────────────────────
-- scope: all (default, no drafts) · open · completed (approved/completed) · rejected · overdue (open & past due)
-- date_field: 'submitted' (default) | 'resolved' — the timestamp date_from/date_to apply to (org time zone).
-- resolved_at: completion time, or the time of the final approve/reject decision.

drop function if exists public.report_request_rows(jsonb);
create function public.report_request_rows(p_filters jsonb default '{}'::jsonb)
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
    join public.request_types rt on rt.id = rq.request_type_id
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

-- SLA performance per request type (over report_request_rows with the same filters).
drop function if exists public.report_sla_rows(jsonb);
create function public.report_sla_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  request_type_id uuid,
  type_ar text,
  type_en text,
  sla_business_days integer,
  total integer,
  closed integer,
  on_time integer,
  late integer,
  on_time_rate numeric,
  avg_resolution_days numeric,
  open integer,
  overdue integer
)
language sql
stable
set search_path = ''
as $$
  select r.request_type_id, max(r.type_ar), max(r.type_en), max(r.sla_business_days),
         count(*)::int,
         count(*) filter (where r.on_time is not null)::int,
         count(*) filter (where r.on_time)::int,
         count(*) filter (where r.on_time = false)::int,
         round((count(*) filter (where r.on_time))::numeric / nullif(count(*) filter (where r.on_time is not null), 0), 4),
         round(avg(r.resolution_business_days) filter (where r.on_time is not null), 1),
         count(*) filter (where r.is_open)::int,
         count(*) filter (where r.is_overdue)::int
  from public.report_request_rows((coalesce(p_filters, '{}'::jsonb) - 'scope') || '{"scope":"all"}'::jsonb) r
  group by r.request_type_id
$$;

-- ─── Certificates ───────────────────────────────────────────────────────────────────────────────────

drop function if exists public.report_certificate_rows(jsonb);
create function public.report_certificate_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  id uuid,
  certificate_number text,
  employee_id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  department_ar text,
  department_en text,
  certificate_type text,
  language text,
  addressed_to text,
  issue_date date,
  status text,
  request_id uuid,
  request_number text,
  revoked_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_status text[] := private.report_text_list(f, 'statuses');
  v_types text[] := private.report_text_list(f, 'certificate_types');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
begin
  return query
  select c.id, c.certificate_number, r.id, r.employee_number, r.name_ar, r.name_en, r.department_ar, r.department_en,
         c.certificate_type, c.language, c.addressed_to, c.issue_date, c.status, c.request_id, rq.request_number, c.revoked_at
  from public.certificates c
  join public.report_employee_rows((f - 'scope' - 'date_from' - 'date_to' - 'statuses') || '{"scope":"all"}'::jsonb) r
    on r.id = c.employee_id
  left join public.hr_requests rq on rq.id = c.request_id
  where (v_status is null or c.status = any (v_status))
    and (v_types is null or c.certificate_type = any (v_types))
    and (v_from is null or c.issue_date >= v_from)
    and (v_to is null or c.issue_date <= v_to);
end;
$$;

-- ─── Audit: user activity ───────────────────────────────────────────────────────────────────────────

drop function if exists public.report_audit_events(jsonb);
create function public.report_audit_events(p_filters jsonb default '{}'::jsonb)
returns table (
  id bigint,
  actor_id uuid,
  actor_email text,
  action text,
  category text,
  created_at timestamptz,
  event_date date
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_cats text[] := private.report_text_list(f, 'categories');
  v_emp uuid[] := private.report_uuid_list(f, 'employee_ids');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_tz text := private.org_timezone();
begin
  return query
  select a.id, a.actor_id, a.actor_email, a.action, private.report_audit_category(a.action), a.created_at,
         (a.created_at at time zone v_tz)::date
  from public.audit_logs a
  where (v_from is null or a.created_at >= (v_from::timestamp at time zone v_tz))
    and (v_to is null or a.created_at < ((v_to + 1)::timestamp at time zone v_tz))
    and (v_cats is null or private.report_audit_category(a.action) = any (v_cats))
    and (v_emp is null or a.actor_id in (select p.id from public.profiles p where p.employee_id = any (v_emp)));
end;
$$;

drop function if exists public.report_user_activity_rows(jsonb);
create function public.report_user_activity_rows(p_filters jsonb default '{}'::jsonb)
returns table (
  actor_key text,
  actor_id uuid,
  actor_email text,
  actor_name text,
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
         max(coalesce(nullif(p.full_name, ''), e.name_ar)),
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

-- ─── Summary (KPIs + chart series) ──────────────────────────────────────────────────────────────────
-- Returns {"kpis": {key: number|null, …}, "charts": {chartKey: [{key, label_ar?, label_en?, <series>: n}]}}.
-- Each branch evaluates its row function once (materialized CTE) and aggregates in SQL.

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
             'total', (select coalesce(sum(b.headcount), 0) from b),
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

-- ─── Catalog preview metrics (one cheap round trip for the Report Center cards) ─────────────────────
drop function if exists public.report_catalog_stats();
create function public.report_catalog_stats()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := private.org_today();
  v_tz text := private.org_timezone();
  v_out jsonb;
begin
  with emp as materialized (
         select e.id, e.department_id, e.job_title_id, nullif(btrim(e.nationality), '') as nationality,
                e.employment_status, e.archived_at, e.joining_date, e.termination_date,
                e.contract_end_date, e.iqama_expiry_date, e.passport_expiry_date
         from public.employees e),
       cur as (select * from emp where emp.archived_at is null and emp.employment_status not in ('resigned', 'terminated')),
       req as materialized (
         select r.status, r.due_at, r.submitted_at, r.completed_at, r.updated_at
         from public.hr_requests r where r.status <> 'draft')
  select jsonb_build_object(
    'employees', (select count(*) from emp where emp.archived_at is null),
    'headcount', (select count(*) from cur),
    'departments', (select count(distinct cur.department_id) from cur where cur.department_id is not null),
    'nationalities', (select count(distinct cur.nationality) from cur where cur.nationality is not null),
    'jobTitles', (select count(distinct cur.job_title_id) from cur where cur.job_title_id is not null),
    'joiners90', (select count(*) from emp where emp.archived_at is null and emp.joining_date between v_today - 90 and v_today),
    'leavers365', (select count(*) from emp where emp.termination_date between v_today - 365 and v_today),
    'contract90', (select count(*) from cur where cur.contract_end_date <= v_today + 90),
    'iqama90', (select count(*) from cur where cur.iqama_expiry_date <= v_today + 90),
    'passport90', (select count(*) from cur where cur.passport_expiry_date <= v_today + 90),
    'insurance90', (select count(*) from public.employee_insurance i
                     join cur on cur.id = i.employee_id
                     where i.expiry_date <= v_today + 90 and coalesce(i.status, 'active') <> 'cancelled'),
    'balanceEmployees', (select count(distinct b.employee_id) from public.leave_balances b
                          join cur on cur.id = b.employee_id
                          where b.year = extract(year from v_today)::int),
    'leaveDaysYear', (select coalesce(sum(lr.days), 0) from public.leave_requests lr
                       join public.hr_requests h on h.id = lr.request_id
                       where h.status in ('approved', 'in_progress', 'completed')
                         and lr.start_date >= date_trunc('year', v_today)::date),
    'requests', (select count(*) from req),
    'open', (select count(*) from req where req.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'in_progress')),
    'overdue', (select count(*) from req where req.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'in_progress')
                                        and req.due_at < now()),
    'completed30', (select count(*) from req where req.status in ('approved', 'completed')
                                            and coalesce(req.completed_at, req.updated_at) >= now() - interval '30 days'),
    'rejected30', (select count(*) from req where req.status = 'rejected' and req.updated_at >= now() - interval '30 days'),
    'certificatesYear', (select count(*) from public.certificates c where c.issue_date >= date_trunc('year', v_today)::date),
    'events30', (select count(*) from public.audit_logs a where a.created_at >= now() - interval '30 days')
  ) into v_out;
  return v_out;
end;
$$;

-- ─── Grants: authenticated only (RLS decides the rows) ──────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.report_employee_rows(jsonb)',
    'public.report_headcount_trend(jsonb)',
    'public.report_employee_breakdown(text, jsonb)',
    'public.report_expiry_rows(text, jsonb)',
    'public.report_leave_balance_rows(jsonb)',
    'public.report_leave_rows(jsonb)',
    'public.report_request_rows(jsonb)',
    'public.report_sla_rows(jsonb)',
    'public.report_certificate_rows(jsonb)',
    'public.report_audit_events(jsonb)',
    'public.report_user_activity_rows(jsonb)',
    'public.report_summary(text, jsonb)',
    'public.report_catalog_stats()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end;
$$;
