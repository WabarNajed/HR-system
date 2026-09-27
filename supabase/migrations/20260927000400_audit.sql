-- =====================================================================================================
-- HR Portal — audit trail: row-change triggers on key tables, append-only audit_logs, log_audit_event RPC
-- Actions: '<entity>.create' | '<entity>.update' | '<entity>.delete' | '<entity>.archive' | '<entity>.restore'
-- Sensitive values (iban, salaries/allowances, national_id, passport_number) are masked as "***"
-- while the field name is still recorded.
-- =====================================================================================================

create or replace function private.audit_summary(p_table text, p_row jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  case p_table
    when 'user_roles' then
      select r.key || ' → ' || coalesce(p.email, p.id::text) into v
      from public.roles r, public.profiles p
      where r.id = (p_row ->> 'role_id')::uuid and p.id = (p_row ->> 'user_id')::uuid;
    when 'role_permissions' then
      select r.key || ': ' || (p_row ->> 'module') || '.' || (p_row ->> 'action') into v
      from public.roles r where r.id = (p_row ->> 'role_id')::uuid;
    when 'profiles' then
      v := coalesce(p_row ->> 'email', p_row ->> 'full_name');
    when 'employee_compensation', 'employee_bank_accounts', 'employee_insurance', 'employee_dependents', 'employee_documents' then
      select concat_ws(' · ', coalesce(nullif(e.name_ar, ''), e.name_en), e.employee_number) into v
      from public.employees e where e.id = (p_row ->> 'employee_id')::uuid;
      if p_table = 'employee_documents' then
        v := concat_ws(' · ', p_row ->> 'document_type', v);
      elsif p_table = 'employee_dependents' then
        v := concat_ws(' · ', coalesce(p_row ->> 'name_ar', p_row ->> 'name_en'), v);
      end if;
    when 'leave_adjustments' then
      select concat_ws(' · ', coalesce(nullif(e.name_ar, ''), e.name_en), lt.code, b.year::text, p_row ->> 'amount') into v
      from public.leave_balances b
      join public.employees e on e.id = b.employee_id
      join public.leave_types lt on lt.id = b.leave_type_id
      where b.id = (p_row ->> 'leave_balance_id')::uuid;
    when 'certificates' then
      v := p_row ->> 'certificate_number';
    when 'request_workflow_steps' then
      v := concat_ws(' · ', p_row ->> 'step_order', p_row ->> 'step_type', p_row ->> 'name_en');
    when 'request_fields' then
      v := concat_ws(' · ', p_row ->> 'key', p_row ->> 'label_en');
    else
      v := coalesce(
        nullif(concat_ws(' · ', coalesce(p_row ->> 'name_ar', p_row ->> 'name_en'), p_row ->> 'employee_number'), ''),
        p_row ->> 'key', p_row ->> 'code', p_row ->> 'event_key', p_row ->> 'name_en'
      );
  end case;
  return left(v, 500);
end;
$$;

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity   text := tg_argv[0];
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_action   text;
  v_key      text;
  v_emp      uuid;
  v_ignore   text[] := array['updated_at', 'updated_by', 'created_at', 'created_by', 'search_text'];
begin
  if coalesce(current_setting('hr.suppress_audit', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row := v_new;
    v_action := 'create';
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignore) or v_new -> v_key = 'null'::jsonb;
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('new', v_new -> v_key));
    end loop;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignore);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null; -- nothing meaningful changed
    end if;
    v_action := case
      when v_old ? 'archived_at' and (v_old ->> 'archived_at') is null and (v_new ->> 'archived_at') is not null then 'archive'
      when v_old ? 'archived_at' and (v_old ->> 'archived_at') is not null and (v_new ->> 'archived_at') is null then 'restore'
      else 'update'
    end;
  else
    v_old := to_jsonb(old);
    v_row := v_old;
    v_action := 'delete';
    for v_key in select jsonb_object_keys(v_old) loop
      continue when v_key = any (v_ignore) or v_old -> v_key = 'null'::jsonb;
      v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key));
    end loop;
  end if;

  v_emp := case
    when tg_table_name = 'employees' then (v_row ->> 'id')::uuid
    when tg_table_name = 'profiles' then (v_row ->> 'employee_id')::uuid
    when tg_table_name = 'leave_adjustments' then
      (select b.employee_id from public.leave_balances b where b.id = (v_row ->> 'leave_balance_id')::uuid)
    when v_row ? 'employee_id' then (v_row ->> 'employee_id')::uuid
  end;

  perform private.write_audit(
    v_entity || '.' || v_action,
    v_entity,
    coalesce(v_row ->> 'id', v_row ->> 'employee_id', v_row ->> 'key'),
    private.audit_summary(tg_table_name, v_row),
    v_changes,
    v_emp
  );
  return null;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('employees', 'employee'),
      ('employee_compensation', 'employee_compensation'),
      ('employee_bank_accounts', 'employee_bank_account'),
      ('employee_insurance', 'employee_insurance'),
      ('employee_dependents', 'employee_dependent'),
      ('employee_documents', 'employee_document'),
      ('user_roles', 'user_role'),
      ('roles', 'role'),
      ('role_permissions', 'role_permission'),
      ('organizations', 'organization'),
      ('organization_settings', 'organization_settings'),
      ('system_settings', 'system_setting'),
      ('departments', 'department'),
      ('job_titles', 'job_title'),
      ('locations', 'location'),
      ('cost_centers', 'cost_center'),
      ('leave_types', 'leave_type'),
      ('public_holidays', 'public_holiday'),
      ('leave_adjustments', 'leave_adjustment'),
      ('request_types', 'request_type'),
      ('request_fields', 'request_field'),
      ('request_workflows', 'request_workflow'),
      ('request_workflow_steps', 'request_workflow_step'),
      ('certificate_templates', 'certificate_template'),
      ('certificates', 'certificate'),
      ('email_templates', 'email_template'),
      ('notification_settings', 'notification_setting')
    ) as t(tbl, entity)
  loop
    execute format('drop trigger if exists audit_row_change on public.%I', r.tbl);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function private.audit_row_change(%L)',
      r.tbl, r.entity
    );
  end loop;
end;
$$;

-- profiles: only status / employee link changes are audited (preferences are not)
drop trigger if exists audit_row_change on public.profiles;
create trigger audit_row_change
  after update on public.profiles
  for each row
  when (old.status is distinct from new.status or old.employee_id is distinct from new.employee_id)
  execute function private.audit_row_change('profile');

-- ---------------------------------------------------------------------------------------------------
-- audit_logs is append-only for everyone (incl. super_admin, service_role and the table owner)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'hr:errors.forbidden' using detail = 'audit_logs is append-only', errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function private.audit_logs_immutable();

drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.audit_logs_immutable();

-- ---------------------------------------------------------------------------------------------------
-- public.log_audit_event — application-level events (login, export, backup, …)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_summary text default null,
  p_changes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' then
    raise exception 'hr:errors.validation' using detail = 'action';
  end if;
  perform private.write_audit(
    p_action,
    left(p_entity_type, 100),
    left(p_entity_id, 200),
    p_summary,
    p_changes,
    case when p_entity_type in ('employee', 'employees') then private.try_uuid(p_entity_id) end
  );
end;
$$;

comment on function public.log_audit_event(text, text, text, text, jsonb) is
  'Append an application audit event as the caller (actor = auth.uid()). Sensitive keys in p_changes are masked.';
