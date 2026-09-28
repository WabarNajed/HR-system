-- employee_records: to-one "manager" relationship for PostgREST embeds.
--
-- The view exposes both sides of the self-referencing employees_manager_id_fkey, so
-- `employee_records?select=manager:manager_id(...)` (or `employees!employees_manager_id_fkey`) is
-- ambiguous (PGRST201). This computed relationship gives readers of the masked read model an
-- unambiguous, sortable manager embed: `manager:manager_record(id, name_ar, name_en, employee_number)`.
-- Security invoker: RLS on employees decides whether the manager row is visible, and only the
-- directory columns are filled (identity / personal columns of the manager are always NULL).
-- Idempotent.

create or replace function public.manager_record(public.employee_records)
returns setof public.employees
language sql
stable
rows 1
set search_path = ''
as $$
  select jsonb_populate_record(null::public.employees, jsonb_build_object(
           'id', m.id,
           'employee_number', m.employee_number,
           'name_ar', m.name_ar,
           'name_en', m.name_en,
           'company_email', m.company_email,
           'mobile', m.mobile,
           'avatar_path', m.avatar_path,
           'department_id', m.department_id,
           'job_title_id', m.job_title_id,
           'location_id', m.location_id,
           'manager_id', m.manager_id,
           'employment_status', m.employment_status,
           'archived_at', m.archived_at))
  from public.employees m
  where m.id = $1.manager_id
$$;

comment on function public.manager_record(public.employee_records) is
  'Computed to-one relationship employee_records → employees (manager). Directory columns only; RLS applies.';

revoke all on function public.manager_record(public.employee_records) from public, anon;
grant execute on function public.manager_record(public.employee_records) to authenticated, service_role;
