-- =====================================================================================================
-- HR Portal — apply default seeds, organization reset RPC, final privilege sweep
-- =====================================================================================================

-- Default configuration (everything reset_organization() restores). Roles/permissions are seeded
-- separately because a reset keeps them.
create or replace function private.seed_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_organization();
  perform private.seed_leave_types();
  perform private.seed_request_types();
  perform private.seed_certificate_templates();
  perform private.seed_email_templates();
  perform private.seed_notification_settings();
end;
$$;

-- seeds are system changes: keep them out of the audit trail
do $$
begin
  perform set_config('hr.suppress_audit', 'on', true);
  perform private.seed_roles_permissions();
  perform private.seed_defaults();
  perform set_config('hr.suppress_audit', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- public.reset_organization — super_admin only, phrase 'RESET ORGANIZATION'.
-- Deletes all business data (employees and sub-records, requests, leave, documents metadata,
-- certificates, notifications, e-mail logs, imports, master data and configuration) and every auth user
-- that is not a super admin; restores the default configuration seeds. Keeps: super admin auth
-- users/profiles, roles, role permissions, audit_logs. Storage objects are removed by the calling server
-- code (service role, Storage API) — SQL cannot delete storage files.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.reset_organization(p_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keep      uuid[];
  v_employees int;
  v_requests  int;
  v_users     int;
begin
  if not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_confirmation is distinct from 'RESET ORGANIZATION' then
    raise exception 'hr:errors.confirmationMismatch';
  end if;

  select count(*) into v_employees from public.employees;
  select count(*) into v_requests from public.hr_requests;
  v_keep := array(
    select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'super_admin'
  );
  select count(*) into v_users from public.profiles p where not (p.id = any (v_keep));

  perform set_config('hr.suppress_audit', 'on', true);

  delete from public.notifications;
  delete from public.email_logs;
  delete from public.certificates;
  delete from public.hr_requests;              -- cascades values, attachments, comments, history, approvals, leave_requests
  delete from public.leave_adjustments;
  delete from public.leave_balances;
  delete from public.employee_documents;
  delete from public.employee_insurance;
  delete from public.employee_dependents;
  delete from public.employee_bank_accounts;
  delete from public.employee_compensation;
  update public.profiles set employee_id = null, matched_employee_id = null
    where employee_id is not null or matched_employee_id is not null;
  update public.departments set head_employee_id = null, parent_id = null;
  delete from public.employees;
  delete from public.import_rows;
  delete from public.imports;
  delete from public.departments;
  delete from public.job_titles;
  delete from public.locations;
  delete from public.cost_centers;
  delete from public.public_holidays;
  update public.request_types set workflow_id = null;
  delete from public.request_workflow_steps;
  delete from public.request_workflows;
  delete from public.request_fields;
  delete from public.request_types;
  delete from public.leave_types;
  delete from public.certificate_template_versions;
  delete from public.certificate_templates;
  delete from public.email_templates;
  delete from public.notification_settings;
  delete from public.system_settings;
  delete from public.document_sequences;
  delete from public.organizations;
  delete from public.organization_settings;

  -- every non-super-admin account (cascades profiles and user_roles)
  delete from auth.users u where not (u.id = any (v_keep));

  perform private.seed_defaults();
  perform set_config('hr.suppress_audit', 'off', true);

  perform private.write_audit('organization.reset', 'organization', null,
                              'Organization reset',
                              jsonb_build_object('employees_deleted', v_employees, 'requests_deleted', v_requests,
                                                 'users_deleted', v_users));
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Final privilege sweep (Supabase default privileges expose every new function to anon/authenticated)
-- ---------------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- the only functions reachable without signing in
grant execute on function public.verify_certificate(text) to anon;
grant execute on function public.get_public_branding() to anon;

-- private: not exposed through the Data API; authenticated needs EXECUTE because RLS policies,
-- storage policies and security-invoker RPCs call these helpers.
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
