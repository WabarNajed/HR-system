-- =====================================================================================================
-- HR Portal — Row Level Security, privileges and guard triggers (ARCHITECTURE.md §7 RLS matrix)
-- Every public table has RLS enabled. anon has no table access at all (public data only through the
-- verify_certificate / get_public_branding RPCs). Multi-row mutations go through security-definer RPCs.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Request visibility helpers (security definer: avoid RLS recursion between hr_requests/request_approvals)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.request_type_has_manager_step(p_request_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with wf as (
    select coalesce(
      (select w.id from public.request_types t join public.request_workflows w on w.id = t.workflow_id
        where t.id = p_request_type_id and w.is_active),
      (select w.id from public.request_workflows w
        where w.request_type_id = p_request_type_id and w.is_active
        order by w.created_at desc limit 1)
    ) as id
  )
  select case
    when exists (select 1 from public.request_workflow_steps s, wf where s.workflow_id = wf.id)
      then exists (select 1 from public.request_workflow_steps s, wf where s.workflow_id = wf.id and s.step_type = 'manager')
    else coalesce((select t.requires_manager_approval from public.request_types t where t.id = p_request_type_id), false)
  end
$$;

create or replace function private.is_request_participant(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.request_approvals a
    where a.request_id = p_request_id and a.approver_id = auth.uid() and a.approver_id is not null
  )
$$;

create or replace function private.can_act_on_role_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.request_workflow_steps s
    where s.id = p_step_id and s.step_type = 'role' and private.has_role(s.approver_role_key)
  )
$$;

-- Profiles a non-HR active user may see: HR staff, their own manager and their direct reports
create or replace function private.visible_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ur.user_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.data_scope = 'organization'
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where private.is_active_user()
  union
  select p.id
  from public.profiles p
  join public.employees e on e.id = p.employee_id
  where private.current_employee_id() is not null
    and (e.manager_id = private.current_employee_id()
         or e.id = (select me.manager_id from public.employees me where me.id = private.current_employee_id()))
$$;

-- Set-returning helpers used by policies as `col in (select …)` so Postgres evaluates them once per
-- statement (hashed sub-plan) instead of once per row.
create or replace function private.my_direct_report_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.id from public.employees e
  where private.current_employee_id() is not null and e.manager_id = private.current_employee_id()
$$;

create or replace function private.my_approval_request_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.request_id from public.request_approvals a
  where a.approver_id = auth.uid() and private.is_active_user()
$$;

create or replace function private.manager_step_request_type_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.request_types t where private.request_type_has_manager_step(t.id)
$$;

create or replace function private.my_role_step_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.request_workflow_steps s
  where s.step_type = 'role' and private.has_role(s.approver_role_key)
$$;

-- Request visibility for ONE request (RPC checks, storage policies). The hr_requests SELECT policy below
-- implements the same rule in set-based form; tests assert both agree.
create or replace function private.can_view_request_row(
  p_request_id uuid,
  p_requester_id uuid,
  p_employee_id uuid,
  p_status text,
  p_request_type_id uuid,
  p_current_approver_id uuid,
  p_current_step_type text,
  p_current_step_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    p_requester_id = auth.uid()
    or (p_status <> 'draft' and (
         p_employee_id = private.current_employee_id()
      or private.has_org_permission('requests', 'view')
      or p_current_approver_id = auth.uid()
      or private.is_request_participant(p_request_id)
      or (private.is_manager_of(p_employee_id) and private.request_type_has_manager_step(p_request_type_id))
      or (p_current_step_type = 'role' and private.can_act_on_role_step(p_current_step_id))
    ))
  )
$$;

create or replace function private.can_view_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_view_request_row(r.id, r.requester_id, r.employee_id, r.status, r.request_type_id,
                                        r.current_approver_id, r.current_step_type, r.current_step_id)
    from public.hr_requests r where r.id = p_request_id
  ), false)
$$;

-- Requester while draft/returned, or HR with requests.edit.
create or replace function private.can_attach_to_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and exists (
    select 1 from public.hr_requests r
    where r.id = p_request_id
      and (
        (r.requester_id = auth.uid() and r.status in ('draft', 'returned'))
        or (r.status not in ('draft', 'cancelled') and private.has_org_permission('requests', 'edit'))
      )
  )
$$;

create or replace function private.can_import()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_permission('employees', 'create') or private.has_org_permission('settings', 'edit')
$$;

-- ---------------------------------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges. Supabase default privileges grant ALL on new public tables to anon/authenticated;
-- tighten them: anon gets nothing, authenticated gets only what RLS + the RPC design need.
-- ---------------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;

-- RPC-only tables: no direct writes for authenticated users
revoke insert, update, delete on
  public.profiles, public.user_roles, public.hr_requests, public.hr_request_values, public.request_comments,
  public.request_history, public.request_approvals, public.leave_requests, public.leave_adjustments,
  public.leave_balances, public.document_sequences, public.notifications, public.email_logs, public.audit_logs,
  public.certificate_template_versions
from authenticated;

-- column-level write grants
grant update (full_name, mobile, preferred_language, theme, registration_employee_number, registration_note)
  on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant update (priority) on public.hr_requests to authenticated;
grant delete on public.hr_requests to authenticated;
grant insert (employee_id, leave_type_id, year, opening_balance, entitlement) on public.leave_balances to authenticated;
grant update (opening_balance, entitlement) on public.leave_balances to authenticated;
grant insert on public.certificate_template_versions to authenticated;

-- document_sequences: RPC only, nobody reads it directly
revoke all on public.document_sequences from authenticated;

-- audit_logs: append-only for everyone, including service_role and the owner
revoke update, delete, truncate on public.audit_logs from authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------------------------------
-- Policies
-- Shorthand used below (wrapped in sub-selects so Postgres evaluates them once per statement):
--   A   = (select private.is_active_user())
--   ME  = (select private.current_employee_id())
-- ---------------------------------------------------------------------------------------------------

-- Organization & settings -----------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select to authenticated
  using ((select private.is_active_user()));
drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update to authenticated
  using ((select private.has_org_permission('settings', 'edit')))
  with check ((select private.has_org_permission('settings', 'edit')));

drop policy if exists organization_settings_select on public.organization_settings;
create policy organization_settings_select on public.organization_settings for select to authenticated
  using ((select private.is_active_user()));
drop policy if exists organization_settings_update on public.organization_settings;
create policy organization_settings_update on public.organization_settings for update to authenticated
  using ((select private.has_org_permission('settings', 'edit')))
  with check ((select private.has_org_permission('settings', 'edit')));

drop policy if exists system_settings_select on public.system_settings;
create policy system_settings_select on public.system_settings for select to authenticated
  using ((select private.is_active_user()));

-- Identity & access ---------------------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select private.is_active_user())
      and (
        (select private.has_org_permission('users', 'view'))
        or (select private.is_hr())
        or id in (select private.visible_profile_ids())
      )
    )
  );
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles for select to authenticated
  using ((select private.is_active_user()));

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles for select to authenticated
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or (select private.has_org_permission('users', 'view')))
  );

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
  using ((select private.is_active_user()));

-- Master data (departments, job titles, locations, cost centers) --------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['departments', 'job_titles', 'locations', 'cost_centers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$
      create policy %I on public.%I for select to authenticated
        using (
          (select private.is_active_user())
          and (is_active or (select private.has_org_permission('settings', 'view'))
               or (select private.has_org_permission('employees', 'view')))
        )$p$, t || '_select', t);
  end loop;
end;
$$;

-- Employees ----------------------------------------------------------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (
    (select private.is_active_user())
    and (
      id = (select private.current_employee_id())
      or manager_id = (select private.current_employee_id())
      or (select private.has_org_permission('employees', 'view'))
    )
  );
drop policy if exists employees_insert on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check ((select private.has_org_permission('employees', 'create')));
drop policy if exists employees_update on public.employees;
create policy employees_update on public.employees for update to authenticated
  using ((select private.has_org_permission('employees', 'edit')))
  with check ((select private.has_org_permission('employees', 'edit')));
drop policy if exists employees_delete on public.employees;
create policy employees_delete on public.employees for delete to authenticated
  using ((select private.has_org_permission('employees', 'administer')));

-- Sensitive employee sub-records: owner (read) + HR per module. Managers get nothing.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('employee_compensation', 'bank'),
      ('employee_bank_accounts', 'bank'),
      ('employee_insurance', 'insurance'),
      ('employee_dependents', 'personal_data')
    ) as t(tbl, module)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_select', r.tbl);
    execute format($p$
      create policy %I on public.%I for select to authenticated
        using (
          (select private.is_active_user())
          and (employee_id = (select private.current_employee_id())
               or (select private.has_org_permission(%L, 'view')))
        )$p$, r.tbl || '_select', r.tbl, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_insert', r.tbl);
    execute format($p$
      create policy %I on public.%I for insert to authenticated
        with check ((select private.has_org_permission(%L, 'create')) or (select private.has_org_permission(%L, 'edit')))$p$,
      r.tbl || '_insert', r.tbl, r.module, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_update', r.tbl);
    execute format($p$
      create policy %I on public.%I for update to authenticated
        using ((select private.has_org_permission(%L, 'edit')))
        with check ((select private.has_org_permission(%L, 'edit')))$p$,
      r.tbl || '_update', r.tbl, r.module, r.module);
    execute format('drop policy if exists %I on public.%I', r.tbl || '_delete', r.tbl);
    execute format($p$
      create policy %I on public.%I for delete to authenticated
        using ((select private.has_org_permission(%L, 'edit')))$p$,
      r.tbl || '_delete', r.tbl, r.module);
  end loop;
end;
$$;

drop policy if exists employee_documents_select on public.employee_documents;
create policy employee_documents_select on public.employee_documents for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (employee_id = (select private.current_employee_id())
        and (not is_confidential or uploaded_by = (select auth.uid())))
      or (select private.has_org_permission('documents', 'view'))
    )
  );
drop policy if exists employee_documents_insert on public.employee_documents;
create policy employee_documents_insert on public.employee_documents for insert to authenticated
  with check (
    (select private.has_org_permission('documents', 'create'))
    or (
      (select private.is_active_user())
      and employee_id = (select private.current_employee_id())
      and uploaded_by = (select auth.uid())
      and status = 'pending_review'
    )
  );
drop policy if exists employee_documents_update on public.employee_documents;
create policy employee_documents_update on public.employee_documents for update to authenticated
  using ((select private.has_org_permission('documents', 'edit')))
  with check ((select private.has_org_permission('documents', 'edit')));
drop policy if exists employee_documents_delete on public.employee_documents;
create policy employee_documents_delete on public.employee_documents for delete to authenticated
  using (
    (select private.has_org_permission('documents', 'edit'))
    or (
      (select private.is_active_user())
      and employee_id = (select private.current_employee_id())
      and uploaded_by = (select auth.uid())
      and status = 'pending_review'
    )
  );

-- Leave --------------------------------------------------------------------------------------------------
drop policy if exists leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types for select to authenticated
  using (
    (select private.is_active_user())
    and (is_active or (select private.has_org_permission('settings', 'view'))
         or (select private.has_org_permission('leave', 'view')))
  );

drop policy if exists public_holidays_select on public.public_holidays;
create policy public_holidays_select on public.public_holidays for select to authenticated
  using ((select private.is_active_user()));

drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.has_org_permission('leave', 'view'))
      or employee_id = (select private.current_employee_id())
      or employee_id in (select private.my_direct_report_ids())
    )
  );
drop policy if exists leave_balances_insert on public.leave_balances;
create policy leave_balances_insert on public.leave_balances for insert to authenticated
  with check ((select private.has_org_permission('leave', 'edit')));
drop policy if exists leave_balances_update on public.leave_balances;
create policy leave_balances_update on public.leave_balances for update to authenticated
  using ((select private.has_org_permission('leave', 'edit')))
  with check ((select private.has_org_permission('leave', 'edit')));

drop policy if exists leave_adjustments_select on public.leave_adjustments;
create policy leave_adjustments_select on public.leave_adjustments for select to authenticated
  using (
    (select private.is_active_user())
    and exists (
      select 1 from public.leave_balances b
      where b.id = leave_adjustments.leave_balance_id
        and (b.employee_id = (select private.current_employee_id())
             or (select private.has_org_permission('leave', 'view')))
    )
  );

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.has_org_permission('leave', 'view'))
      or employee_id = (select private.current_employee_id())
      or employee_id in (select private.my_direct_report_ids())
    )
  );

-- Request configuration ---------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['request_types', 'request_fields', 'request_workflows'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format($p$
      create policy %I on public.%I for select to authenticated
        using ((select private.is_active_user())
               and (is_active or (select private.has_org_permission('settings', 'view'))
                    or (select private.has_org_permission('requests', 'view'))))$p$, t || '_select', t);
  end loop;
end;
$$;

drop policy if exists request_workflow_steps_select on public.request_workflow_steps;
create policy request_workflow_steps_select on public.request_workflow_steps for select to authenticated
  using ((select private.is_active_user()));

-- Requests -------------------------------------------------------------------------------------------------
drop policy if exists hr_requests_select on public.hr_requests;
create policy hr_requests_select on public.hr_requests for select to authenticated
  using (
    ((select private.has_org_permission('requests', 'view')) and status <> 'draft')
    or (
      (select private.is_active_user())
      and (
        requester_id = (select auth.uid())
        or (status <> 'draft' and (
          employee_id = (select private.current_employee_id())
          or current_approver_id = (select auth.uid())
          or id in (select private.my_approval_request_ids())
          or (employee_id in (select private.my_direct_report_ids())
              and request_type_id in (select private.manager_step_request_type_ids()))
          or (current_step_type = 'role' and current_step_id in (select private.my_role_step_ids()))
        ))
      )
    )
  );
drop policy if exists hr_requests_update on public.hr_requests;
create policy hr_requests_update on public.hr_requests for update to authenticated
  using ((select private.has_org_permission('requests', 'edit')) and status <> 'draft')
  with check ((select private.has_org_permission('requests', 'edit')));
drop policy if exists hr_requests_delete_draft on public.hr_requests;
create policy hr_requests_delete_draft on public.hr_requests for delete to authenticated
  using ((select private.is_active_user()) and requester_id = (select auth.uid()) and status = 'draft');

drop policy if exists hr_request_values_select on public.hr_request_values;
create policy hr_request_values_select on public.hr_request_values for select to authenticated
  using (exists (select 1 from public.hr_requests r where r.id = hr_request_values.request_id));

drop policy if exists request_attachments_select on public.request_attachments;
create policy request_attachments_select on public.request_attachments for select to authenticated
  using (exists (select 1 from public.hr_requests r where r.id = request_attachments.request_id));
drop policy if exists request_attachments_insert on public.request_attachments;
create policy request_attachments_insert on public.request_attachments for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_attach_to_request(request_id));
drop policy if exists request_attachments_delete on public.request_attachments;
create policy request_attachments_delete on public.request_attachments for delete to authenticated
  using (private.can_attach_to_request(request_id)
         and (uploaded_by = (select auth.uid()) or (select private.has_org_permission('requests', 'edit'))));

drop policy if exists request_comments_select on public.request_comments;
create policy request_comments_select on public.request_comments for select to authenticated
  using (
    exists (select 1 from public.hr_requests r where r.id = request_comments.request_id)
    and (not is_internal or (select private.has_org_permission('requests', 'view')))
  );

drop policy if exists request_history_select on public.request_history;
create policy request_history_select on public.request_history for select to authenticated
  using (exists (select 1 from public.hr_requests r where r.id = request_history.request_id));

drop policy if exists request_approvals_select on public.request_approvals;
create policy request_approvals_select on public.request_approvals for select to authenticated
  using (exists (select 1 from public.hr_requests r where r.id = request_approvals.request_id));

-- Certificates & templates ------------------------------------------------------------------------------------
drop policy if exists certificate_templates_select on public.certificate_templates;
create policy certificate_templates_select on public.certificate_templates for select to authenticated
  using (
    (select private.is_active_user())
    and (is_active or (select private.has_org_permission('settings', 'view'))
         or (select private.has_org_permission('certificates', 'view')))
  );

drop policy if exists certificate_template_versions_select on public.certificate_template_versions;
create policy certificate_template_versions_select on public.certificate_template_versions for select to authenticated
  using ((select private.has_org_permission('settings', 'view')) or (select private.has_org_permission('certificates', 'view')));
drop policy if exists certificate_template_versions_insert on public.certificate_template_versions;
create policy certificate_template_versions_insert on public.certificate_template_versions for insert to authenticated
  with check ((select private.has_org_permission('settings', 'edit')));

drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (employee_id = (select private.current_employee_id()) and status = 'valid')
      or (select private.has_org_permission('certificates', 'view'))
    )
  );
drop policy if exists certificates_insert on public.certificates;
create policy certificates_insert on public.certificates for insert to authenticated
  with check ((select private.has_org_permission('certificates', 'create')));
drop policy if exists certificates_update on public.certificates;
create policy certificates_update on public.certificates for update to authenticated
  using ((select private.has_org_permission('certificates', 'edit')) or (select private.has_org_permission('certificates', 'create')))
  with check ((select private.has_org_permission('certificates', 'edit')) or (select private.has_org_permission('certificates', 'create')));

-- Communication ---------------------------------------------------------------------------------------------
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications for delete to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

drop policy if exists notification_settings_select on public.notification_settings;
create policy notification_settings_select on public.notification_settings for select to authenticated
  using ((select private.has_org_permission('settings', 'view')));

drop policy if exists email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates for select to authenticated
  using ((select private.has_org_permission('settings', 'view')));

drop policy if exists email_logs_select on public.email_logs;
create policy email_logs_select on public.email_logs for select to authenticated
  using ((select private.has_org_permission('settings', 'view')) or (select private.has_org_permission('audit', 'view')));

-- Data management & audit ----------------------------------------------------------------------------------------
drop policy if exists imports_all on public.imports;
create policy imports_all on public.imports for all to authenticated
  using ((select private.can_import()))
  with check ((select private.can_import()));

drop policy if exists import_rows_all on public.import_rows;
create policy import_rows_all on public.import_rows for all to authenticated
  using ((select private.can_import()))
  with check ((select private.can_import()));

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.has_org_permission('audit', 'view')));

-- Configuration writes: separate INSERT / UPDATE / DELETE policies (no FOR ALL, so SELECT is governed by
-- exactly one policy per table)
do $$
declare
  r  record;
  op text;
begin
  for r in
    select * from (values
      ('system_settings', 'settings', 'edit'),
      ('roles', 'users', 'administer'),
      ('role_permissions', 'users', 'administer'),
      ('departments', 'settings', 'edit'),
      ('job_titles', 'settings', 'edit'),
      ('locations', 'settings', 'edit'),
      ('cost_centers', 'settings', 'edit'),
      ('leave_types', 'settings', 'edit'),
      ('public_holidays', 'settings', 'edit'),
      ('request_types', 'settings', 'edit'),
      ('request_fields', 'settings', 'edit'),
      ('request_workflows', 'settings', 'edit'),
      ('request_workflow_steps', 'settings', 'edit'),
      ('certificate_templates', 'settings', 'edit'),
      ('notification_settings', 'settings', 'edit'),
      ('email_templates', 'settings', 'edit')
    ) as t(tbl, module, action)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_write', r.tbl);
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', r.tbl || '_' || op, r.tbl);
      if op = 'insert' then
        execute format('create policy %I on public.%I for insert to authenticated with check ((select private.has_org_permission(%L, %L)))',
                       r.tbl || '_insert', r.tbl, r.module, r.action);
      elsif op = 'update' then
        execute format('create policy %I on public.%I for update to authenticated using ((select private.has_org_permission(%L, %L))) with check ((select private.has_org_permission(%L, %L)))',
                       r.tbl || '_update', r.tbl, r.module, r.action, r.module, r.action);
      else
        execute format('create policy %I on public.%I for delete to authenticated using ((select private.has_org_permission(%L, %L)))',
                       r.tbl || '_delete', r.tbl, r.module, r.action);
      end if;
    end loop;
  end loop;
end;
$$;

-- document_sequences: RLS on, no policies (RPC access only)

-- ---------------------------------------------------------------------------------------------------
-- Guard triggers (defense in depth for direct table writes by authenticated users)
-- The guard functions are SECURITY INVOKER on purpose: current_user = 'authenticated' identifies a
-- direct Data API write; statements issued inside security-definer RPCs run as the function owner and
-- service-role code runs as service_role, so both bypass these checks.
-- ---------------------------------------------------------------------------------------------------

-- profiles: status / employee link / identity columns only through RPCs; registration fields only while
-- the registration is open. Updating registration info while info_requested re-opens the registration.
create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reg_changed boolean;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.status is distinct from old.status
     or new.employee_id is distinct from old.employee_id
     or new.email is distinct from old.email
     or new.matched_employee_id is distinct from old.matched_employee_id
     or new.review_note is distinct from old.review_note
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.last_login_at is distinct from old.last_login_at
     or new.invited_at is distinct from old.invited_at then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  v_reg_changed := new.registration_employee_number is distinct from old.registration_employee_number
                   or new.registration_note is distinct from old.registration_note;
  if v_reg_changed and old.status not in ('pending', 'info_requested') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if old.status = 'info_requested'
     and (v_reg_changed or new.full_name is distinct from old.full_name or new.mobile is distinct from old.mobile) then
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- When an applicant answers an information request, notify the registration reviewers again.
create or replace function private.profiles_registration_reopened()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'info_requested' and new.status = 'pending' then
    perform private.notify_many(
      array(select private.users_with_org_permission('users', 'approve')),
      'registration_submitted',
      jsonb_build_object('full_name', new.full_name, 'email', new.email,
                         'employee_number', new.registration_employee_number, 'resubmitted', true),
      '/settings/pending-registrations', 'profile', new.id
    );
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_registration_reopened on public.profiles;
create trigger profiles_registration_reopened
  after update on public.profiles
  for each row
  when (old.status = 'info_requested' and new.status = 'pending')
  execute function private.profiles_registration_reopened();

-- The last active super admin can never lose the role or be deactivated.
create or replace function private.active_super_admin_count(p_exclude uuid default null)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct ur.user_id)::int
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.key = 'super_admin'
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  where p_exclude is null or ur.user_id <> p_exclude
$$;

create or replace function private.guard_last_super_admin_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- cascaded deletes (auth user deleted from the dashboard) are not blocked here
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if exists (select 1 from public.roles r where r.id = old.role_id and r.key = 'super_admin')
     and exists (select 1 from public.profiles p where p.id = old.user_id and p.status = 'active')
     and private.active_super_admin_count() = 0 then
    raise exception 'hr:errors.lastSuperAdmin' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists guard_last_super_admin_role on public.user_roles;
create trigger guard_last_super_admin_role
  after delete on public.user_roles
  for each row execute function private.guard_last_super_admin_role();

create or replace function private.guard_last_super_admin_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active'
     and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                 where ur.user_id = new.id and r.key = 'super_admin')
     and private.active_super_admin_count() = 0 then
    raise exception 'hr:errors.lastSuperAdmin' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists guard_last_super_admin_status on public.profiles;
create trigger guard_last_super_admin_status
  after update on public.profiles
  for each row
  when (old.status = 'active' and new.status <> 'active')
  execute function private.guard_last_super_admin_status();

-- employees: personal / identity columns need personal_data.edit on direct writes
create or replace function private.employees_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if (new.national_id, new.id_type, new.iqama_issue_date, new.iqama_expiry_date, new.iqama_expiry_hijri,
      new.iqama_profession, new.passport_number, new.passport_expiry_date, new.date_of_birth, new.marital_status,
      new.address, new.personal_email, new.emergency_contact_name, new.emergency_contact_relationship,
      new.emergency_contact_mobile, new.employer_number, new.is_outside_kingdom)
     is distinct from
     (old.national_id, old.id_type, old.iqama_issue_date, old.iqama_expiry_date, old.iqama_expiry_hijri,
      old.iqama_profession, old.passport_number, old.passport_expiry_date, old.date_of_birth, old.marital_status,
      old.address, old.personal_email, old.emergency_contact_name, old.emergency_contact_relationship,
      old.emergency_contact_mobile, old.employer_number, old.is_outside_kingdom)
     and not private.has_org_permission('personal_data', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

drop trigger if exists employees_guard on public.employees;
create trigger employees_guard
  before update on public.employees
  for each row execute function private.employees_guard();

-- roles: system roles keep their key/flags; data_scope of system roles only changeable by super_admin
create or replace function private.roles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'hr:errors.systemRecord';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.is_system := false;
    if new.data_scope = 'organization' and not private.is_super_admin() then
      raise exception 'hr:errors.forbidden' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.is_system and (new.key is distinct from old.key or new.is_system is distinct from old.is_system) then
    raise exception 'hr:errors.systemRecord';
  end if;
  if not old.is_system and new.is_system then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if new.data_scope is distinct from old.data_scope and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if old.key = 'super_admin' and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists roles_guard on public.roles;
create trigger roles_guard
  before insert or update or delete on public.roles
  for each row execute function private.roles_guard();

-- role_permissions: the super_admin role's permissions are fixed (it has everything implicitly)
create or replace function private.role_permissions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if exists (select 1 from public.roles r where r.id in (coalesce(new.role_id, old.role_id), old.role_id) and r.key = 'super_admin') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists role_permissions_guard on public.role_permissions;
create trigger role_permissions_guard
  before insert or update or delete on public.role_permissions
  for each row execute function private.role_permissions_guard();

-- request configuration: system fields/types cannot be deleted, system field keys/types cannot change
create or replace function private.request_config_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'hr:errors.systemRecord';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.is_system := false;
    return new;
  end if;
  if old.is_system and (new.key is distinct from old.key or new.is_system is distinct from old.is_system) then
    raise exception 'hr:errors.systemRecord';
  end if;
  if not old.is_system and new.is_system then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if tg_table_name = 'request_fields' and old.is_system
     and (to_jsonb(new) ->> 'field_type') is distinct from (to_jsonb(old) ->> 'field_type') then
    raise exception 'hr:errors.systemRecord';
  end if;
  return new;
end;
$$;

drop trigger if exists request_config_guard on public.request_types;
create trigger request_config_guard
  before insert or update or delete on public.request_types
  for each row execute function private.request_config_guard();
drop trigger if exists request_config_guard on public.request_fields;
create trigger request_config_guard
  before insert or update or delete on public.request_fields
  for each row execute function private.request_config_guard();

-- certificates: employee_id / number immutable on direct writes; revocation stamps revoked_at
create or replace function private.certificates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.issued_by := auth.uid();
      new.status := 'valid';
      new.revoked_at := null;
    end if;
    return new;
  end if;
  if current_user = 'authenticated'
     and (new.certificate_number is distinct from old.certificate_number or new.employee_id is distinct from old.employee_id) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if old.status = 'revoked' and new.status = 'valid' then
    raise exception 'hr:errors.invalidTransition';
  end if;
  if old.status = 'valid' and new.status = 'revoked' then
    new.revoked_at := coalesce(new.revoked_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists certificates_guard on public.certificates;
create trigger certificates_guard
  before insert or update on public.certificates
  for each row execute function private.certificates_guard();

-- notify the employee when a certificate is issued
create or replace function private.certificates_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emp record;
begin
  select e.name_ar, e.name_en into v_emp from public.employees e where e.id = new.employee_id;
  perform private.notify(
    private.employee_profile_id(new.employee_id),
    'certificate_issued',
    jsonb_build_object('certificate_number', new.certificate_number, 'certificate_type', new.certificate_type,
                       'employee_name_ar', v_emp.name_ar, 'employee_name_en', v_emp.name_en,
                       'actor_name', private.profile_display_name(auth.uid())),
    '/certificates', 'certificate', new.id
  );
  return null;
end;
$$;

drop trigger if exists certificates_notify on public.certificates;
create trigger certificates_notify
  after insert on public.certificates
  for each row execute function private.certificates_notify();

-- certificate template versions: changed_by is always the caller
create or replace function private.template_versions_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.changed_by := coalesce(auth.uid(), new.changed_by);
  new.changed_at := now();
  return new;
end;
$$;

drop trigger if exists template_versions_defaults on public.certificate_template_versions;
create trigger template_versions_defaults
  before insert on public.certificate_template_versions
  for each row execute function private.template_versions_defaults();

-- request attachments: uploader is always the caller
create or replace function private.request_attachments_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  return new;
end;
$$;

drop trigger if exists request_attachments_defaults on public.request_attachments;
create trigger request_attachments_defaults
  before insert on public.request_attachments
  for each row execute function private.request_attachments_defaults();
