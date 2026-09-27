-- M2 · settings_overview(): report HR admins and super admins separately (the Settings console
-- "Configuration health" flags a missing HR Admin even when a Super Admin exists).
-- Idempotent (create or replace); same signature and grants as 20260928020000.

create or replace function private.active_role_holders(p_role_key text)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ur.user_id)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where r.key = p_role_key and p.status = 'active'
$$;

revoke all on function private.active_role_holders(text) from public, anon, authenticated;
grant execute on function private.active_role_holders(text) to service_role;

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
            'working_days', to_jsonb(s.working_days), 'weekend_days', to_jsonb(s.weekend_days),
            'work_start', s.work_start, 'work_end', s.work_end,
            'fiscal_year_start_month', s.fiscal_year_start_month,
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
        'request_fields', (select jsonb_build_object('total', count(*)) from public.request_fields where is_active),
        'workflows', (select jsonb_build_object('total', count(*), 'inactive', count(*) filter (where not is_active)) from public.request_workflows),
        'request_types_without_workflow', (select count(*) from public.request_types t where t.is_active and t.workflow_id is null),
        'sla', (select jsonb_build_object('with_sla', count(*) filter (where sla_business_days is not null and sla_business_days > 0), 'total', count(*)) from public.request_types where is_active),
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
        'hr_admins', private.active_role_holders('hr_admin'),
        'super_admins', private.active_role_holders('super_admin')
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
