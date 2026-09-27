-- M2 · Settings console & organization setup
--
-- 1. Bilingual descriptions on the four master-data tables (departments, job titles, locations,
--    cost centers).
-- 2. Delete guard: master data referenced by employees (incl. archived) — or a department that still
--    has sub-departments — can't be deleted through the Data API (the FKs are ON DELETE SET NULL, which
--    would silently unlink employees). Raises hr:errors.inUse; the UI offers "deactivate" instead.
--    Definer RPCs (reset_organization) and service-role code bypass the guard, like the other guards.
-- 3. Department hierarchy guard: a department can't become its own ancestor.
-- 4. public.master_data_usage(p_entity) → per-row employee / sub-department counts (settings.view).
-- 5. public.settings_overview() → counts and configuration facts for the Settings console home;
--    each section is returned only when the caller holds the matching permission.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------------
-- 1. Descriptions
-- ---------------------------------------------------------------------------------------------------
alter table public.departments  add column if not exists description_ar text;
alter table public.departments  add column if not exists description_en text;
alter table public.job_titles   add column if not exists description_ar text;
alter table public.job_titles   add column if not exists description_en text;
alter table public.locations    add column if not exists description_ar text;
alter table public.locations    add column if not exists description_en text;
alter table public.cost_centers add column if not exists description_ar text;
alter table public.cost_centers add column if not exists description_en text;

-- ---------------------------------------------------------------------------------------------------
-- 2. Delete guard (security invoker on purpose — see the guard-trigger note in 000500_rls.sql)
-- ---------------------------------------------------------------------------------------------------
-- The guard must see every employee row regardless of the caller's RLS scope: run the existence
-- checks through a definer helper.
create or replace function private.master_data_in_use(p_table text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_table
    when 'departments' then
      exists (select 1 from public.employees e where e.department_id = p_id)
      or exists (select 1 from public.departments d where d.parent_id = p_id)
    when 'job_titles' then exists (select 1 from public.employees e where e.job_title_id = p_id)
    when 'locations' then exists (select 1 from public.employees e where e.location_id = p_id)
    when 'cost_centers' then exists (select 1 from public.employees e where e.cost_center_id = p_id)
    else false
  end
$$;

create or replace function private.master_data_delete_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return old;
  end if;
  if private.master_data_in_use(tg_table_name, old.id) then
    raise exception 'hr:errors.inUse' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists master_data_delete_guard on public.departments;
create trigger master_data_delete_guard before delete on public.departments
  for each row execute function private.master_data_delete_guard();
drop trigger if exists master_data_delete_guard on public.job_titles;
create trigger master_data_delete_guard before delete on public.job_titles
  for each row execute function private.master_data_delete_guard();
drop trigger if exists master_data_delete_guard on public.locations;
create trigger master_data_delete_guard before delete on public.locations
  for each row execute function private.master_data_delete_guard();
drop trigger if exists master_data_delete_guard on public.cost_centers;
create trigger master_data_delete_guard before delete on public.cost_centers
  for each row execute function private.master_data_delete_guard();

-- ---------------------------------------------------------------------------------------------------
-- 3. Department hierarchy: no cycles
-- ---------------------------------------------------------------------------------------------------
create or replace function private.department_parent_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor uuid := new.parent_id;
  v_depth int := 0;
begin
  if new.parent_id is null then
    return new;
  end if;
  while v_cursor is not null and v_depth < 100 loop
    if v_cursor = new.id then
      raise exception 'hr:masterData.errors.parentCycle' using errcode = 'P0001';
    end if;
    select d.parent_id into v_cursor from public.departments d where d.id = v_cursor;
    v_depth := v_depth + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists department_parent_guard on public.departments;
create trigger department_parent_guard before insert or update of parent_id on public.departments
  for each row execute function private.department_parent_guard();

-- ---------------------------------------------------------------------------------------------------
-- 4. Usage counts per master-data row
-- ---------------------------------------------------------------------------------------------------
create or replace function public.master_data_usage(p_entity text)
returns table (id uuid, employees bigint, all_employees bigint, children bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_org_permission('settings', 'view') or private.has_org_permission('employees', 'view')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;

  if p_entity = 'departments' then
    return query
      select d.id,
             (select count(*) from public.employees e where e.department_id = d.id and e.archived_at is null),
             (select count(*) from public.employees e where e.department_id = d.id),
             (select count(*) from public.departments c where c.parent_id = d.id)
      from public.departments d;
  elsif p_entity = 'job_titles' then
    return query
      select j.id,
             (select count(*) from public.employees e where e.job_title_id = j.id and e.archived_at is null),
             (select count(*) from public.employees e where e.job_title_id = j.id),
             0::bigint
      from public.job_titles j;
  elsif p_entity = 'locations' then
    return query
      select l.id,
             (select count(*) from public.employees e where e.location_id = l.id and e.archived_at is null),
             (select count(*) from public.employees e where e.location_id = l.id),
             0::bigint
      from public.locations l;
  elsif p_entity = 'cost_centers' then
    return query
      select c.id,
             (select count(*) from public.employees e where e.cost_center_id = c.id and e.archived_at is null),
             (select count(*) from public.employees e where e.cost_center_id = c.id),
             0::bigint
      from public.cost_centers c;
  else
    raise exception 'hr:errors.validation' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.master_data_usage(text) from public, anon;
grant execute on function public.master_data_usage(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- 5. Settings console overview
-- ---------------------------------------------------------------------------------------------------
create or replace function public.settings_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_settings_view boolean := private.has_org_permission('settings', 'view');
  v_users_view boolean := private.has_org_permission('users', 'view');
  v_users_approve boolean := private.has_org_permission('users', 'approve');
  v_audit_view boolean := private.has_org_permission('audit', 'view');
  v_imports boolean := private.has_org_permission('employees', 'create') or private.has_org_permission('settings', 'edit');
  v_leave boolean := v_settings_view or private.has_org_permission('leave', 'administer');
  v_certs boolean := v_settings_view or private.has_org_permission('certificates', 'administer');
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if not (v_settings_view or v_users_view or v_users_approve or v_audit_view or v_leave or v_certs) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;

  v_result := jsonb_build_object('generated_at', now());

  if v_settings_view then
    v_result := v_result
      || jsonb_build_object(
        'organization', (
          select jsonb_build_object(
            'name_ar', o.name_ar, 'name_en', o.name_en,
            'legal_name_ar', o.legal_name_ar, 'legal_name_en', o.legal_name_en,
            'has_logo', o.logo_path is not null,
            'hr_email', o.hr_email, 'phone', o.phone, 'city', o.city, 'country', o.country,
            'commercial_registration', o.commercial_registration, 'vat_number', o.vat_number,
            'updated_at', o.updated_at)
          from public.organizations o limit 1),
        'settings', (
          select jsonb_build_object(
            'currency', s.currency, 'timezone', s.timezone, 'default_language', s.default_language,
            'working_days', to_jsonb(s.working_days), 'work_start', s.work_start, 'work_end', s.work_end,
            'portal_name_ar', s.portal_name_ar, 'portal_name_en', s.portal_name_en,
            'primary_color', s.primary_color, 'secondary_color', s.secondary_color,
            'has_login_image', s.login_image_path is not null,
            'has_stamp', s.stamp_path is not null, 'has_signature', s.signature_path is not null,
            'has_signatory', coalesce(nullif(btrim(s.signatory_name_ar), ''), nullif(btrim(s.signatory_name_en), '')) is not null,
            'allow_self_registration', s.allow_self_registration,
            'session_timeout_minutes', s.session_timeout_minutes,
            'setup_completed_at', s.setup_completed_at,
            'updated_at', s.updated_at)
          from public.organization_settings s limit 1),
        'departments', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.departments),
        'job_titles', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.job_titles),
        'locations', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.locations),
        'cost_centers', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.cost_centers),
        'request_types', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.request_types),
        'workflows', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.request_workflows),
        'request_types_without_workflow', (select count(*) from public.request_types t where t.is_active and t.workflow_id is null),
        'email_templates', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.email_templates),
        'notification_rules', (select jsonb_build_object('total', count(*), 'email_enabled', count(*) filter (where email_enabled)) from public.notification_settings),
        'employees', (select jsonb_build_object('total', count(*) filter (where archived_at is null)) from public.employees)
      );
  end if;

  if v_leave then
    v_result := v_result
      || jsonb_build_object(
        'leave_types', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.leave_types),
        'public_holidays', (
          select jsonb_build_object(
            'total', count(*),
            'this_year', count(*) filter (where extract(year from start_date) = extract(year from private.org_today())),
            'upcoming', count(*) filter (where is_active and end_date >= private.org_today()))
          from public.public_holidays)
      );
  end if;

  if v_certs then
    v_result := v_result
      || jsonb_build_object(
        'certificate_templates', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.certificate_templates)
      );
  end if;

  if v_users_view or v_users_approve then
    v_result := v_result
      || jsonb_build_object(
        'users', (
          select jsonb_build_object(
            'total', count(*),
            'active', count(*) filter (where p.status = 'active'),
            'pending', count(*) filter (where p.status in ('pending', 'info_requested')),
            'disabled', count(*) filter (where p.status = 'disabled'))
          from public.profiles p),
        'roles', (select jsonb_build_object('total', count(*), 'custom', count(*) filter (where not is_system)) from public.roles),
        'hr_admins', (
          select count(distinct ur.user_id)
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          join public.profiles p on p.id = ur.user_id
          where r.key in ('hr_admin', 'super_admin') and p.status = 'active'),
        'super_admins', (
          select count(distinct ur.user_id)
          from public.user_roles ur
          join public.roles r on r.id = ur.role_id
          join public.profiles p on p.id = ur.user_id
          where r.key = 'super_admin' and p.status = 'active')
      );
  end if;

  if v_imports then
    v_result := v_result
      || jsonb_build_object(
        'imports', (
          select jsonb_build_object('total', count(*), 'last_at', max(created_at), 'failed', count(*) filter (where status = 'failed'))
          from public.imports)
      );
  end if;

  if v_audit_view then
    v_result := v_result
      || jsonb_build_object(
        'audit', (
          select jsonb_build_object('last_7_days', count(*), 'last_at', max(created_at))
          from public.audit_logs where created_at >= now() - interval '7 days')
      );
  end if;

  return v_result;
end;
$$;

revoke execute on function public.settings_overview() from public, anon;
grant execute on function public.settings_overview() to authenticated, service_role;

-- Called from the (invoker) delete guard, so `authenticated` needs EXECUTE; it only returns a boolean.
revoke all on function private.master_data_in_use(text, uuid) from public, anon;
grant execute on function private.master_data_in_use(text, uuid) to authenticated, service_role;
revoke all on function private.master_data_delete_guard() from public, anon;
revoke all on function private.department_parent_guard() from public, anon;
