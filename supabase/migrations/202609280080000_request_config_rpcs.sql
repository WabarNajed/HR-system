-- =====================================================================================================
-- M8 · Request configuration & communication settings — builder RPCs
--
-- The Request Types admin, Form Builder and Workflow Builder save through these security-definer RPCs
-- so every save is atomic (one transaction) and validated in the database:
--
--   save_request_type(p_id, p_values)                 create / update a type; keeps its workflow in step
--                                                     with requires_manager_approval / requires_hr_approval
--   duplicate_request_type(p_source_id, key, names)   copy a type with its fields and workflow (inactive)
--   save_request_fields(p_request_type_id, p_fields)  replace a type's form (order, properties, deletions)
--   save_request_workflow(p_request_type_id, p_steps) replace a type's approval steps; syncs the flags
--   request_type_usage()                              per-type request counts + SLA performance (aggregates)
--   request_field_usage(p_request_type_id)            which field keys hold stored request values
--   email_log_links(p_notification_ids)               related record links for Email log rows
--
-- Authorization: org-scoped `settings.edit` for writes, `settings.view` for reads (the same rules as the
-- RLS write policies on these tables). The request_config_guard trigger only fires for direct
-- `authenticated` writes, so the system-field rules are re-checked here explicitly.
-- Row changes stay audited by the existing audit_row_change triggers (actor = auth.uid()).
-- Idempotent: create or replace only.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------

-- Field keys referenced by a visibility rule ({field, in|not_in} | {all: [...]} | {any: [...]}).
create or replace function private.rule_field_refs(p_rule jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  with recursive r(rule) as (
    select p_rule
    union all
    select e.value
    from r, jsonb_array_elements(
      case
        when jsonb_typeof(r.rule) = 'object' and jsonb_typeof(r.rule -> 'all') = 'array' then r.rule -> 'all'
        when jsonb_typeof(r.rule) = 'object' and jsonb_typeof(r.rule -> 'any') = 'array' then r.rule -> 'any'
        else '[]'::jsonb
      end) e
  )
  select r.rule ->> 'field' from r where jsonb_typeof(r.rule) = 'object' and r.rule ? 'field'
$$;

revoke all on function private.rule_field_refs(jsonb) from public, anon, authenticated;

-- The workflow a type uses (explicit workflow_id of the type, else its latest workflow); creates one when
-- p_create and none exists. Mirrors private.resolve_steps' choice.
create or replace function private.request_type_workflow(p_request_type_id uuid, p_create boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type public.request_types;
  v_wf   uuid;
begin
  select * into v_type from public.request_types where id = p_request_type_id;
  if not found then
    return null;
  end if;
  select w.id into v_wf from public.request_workflows w where w.id = v_type.workflow_id and w.request_type_id = v_type.id;
  if v_wf is null then
    select w.id into v_wf from public.request_workflows w
    where w.request_type_id = v_type.id
    order by w.is_active desc, w.created_at desc
    limit 1;
  end if;
  if v_wf is null and p_create then
    insert into public.request_workflows (request_type_id, name_ar, name_en, is_active)
    values (v_type.id, v_type.name_ar, v_type.name_en, true)
    returning id into v_wf;
  end if;
  if v_wf is not null then
    update public.request_workflows set is_active = true where id = v_wf and not is_active;
    update public.request_types set workflow_id = v_wf where id = v_type.id and workflow_id is distinct from v_wf;
  end if;
  return v_wf;
end;
$$;

revoke all on function private.request_type_workflow(uuid, boolean) from public, anon, authenticated;

-- Renumbers a workflow's steps 1..n (keeping their order) and moves pending in-flight requests of the type
-- to the new position of the step they are waiting on, so an inserted/removed step never re-routes them.
create or replace function private.renumber_workflow_steps(p_workflow_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  set constraints public.request_workflow_steps_order_unique deferred;
  update public.request_workflow_steps s
  set step_order = x.rn
  from (
    select id, row_number() over (order by step_order, created_at) as rn
    from public.request_workflow_steps
    where workflow_id = p_workflow_id
  ) x
  where s.id = x.id and s.step_order <> x.rn;
  set constraints public.request_workflow_steps_order_unique immediate;

  update public.hr_requests r
  set current_step_order = s.step_order
  from public.request_workflow_steps s
  where s.workflow_id = p_workflow_id
    and r.current_step_id = s.id
    and r.status in ('submitted', 'pending_manager_approval', 'pending_hr_review')
    and r.current_step_order is distinct from s.step_order;
end;
$$;

revoke all on function private.renumber_workflow_steps(uuid) from public, anon, authenticated;

create or replace function private.assert_settings_edit()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() or not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_settings_edit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------
-- save_request_type
-- p_values: key (new types only), category, name_ar/en, description_ar/en, icon, color,
--           sla_business_days, requires_manager_approval, requires_hr_approval, allow_attachments,
--           sort_order, is_active
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_request_type(p_id uuid, p_values jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      public.request_types;
  v_id       uuid := p_id;
  v_key      text := lower(btrim(coalesce(p_values ->> 'key', '')));
  v_category text := lower(btrim(coalesce(p_values ->> 'category', 'general')));
  v_name_ar  text := private.nullif_blank(p_values ->> 'name_ar');
  v_name_en  text := private.nullif_blank(p_values ->> 'name_en');
  v_desc_ar  text := private.nullif_blank(p_values ->> 'description_ar');
  v_desc_en  text := private.nullif_blank(p_values ->> 'description_en');
  v_icon     text := coalesce(private.nullif_blank(p_values ->> 'icon'), 'file-text');
  v_color    text := private.nullif_blank(p_values ->> 'color');
  v_sla      int;
  v_sort     int;
  v_mgr      boolean := coalesce((p_values ->> 'requires_manager_approval')::boolean, false);
  v_hr       boolean := coalesce((p_values ->> 'requires_hr_approval')::boolean, true);
  v_attach   boolean := coalesce((p_values ->> 'allow_attachments')::boolean, true);
  v_active   boolean := coalesce((p_values ->> 'is_active')::boolean, true);
  v_wf       uuid;
  v_sync     boolean;
begin
  perform private.assert_settings_edit();
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'hr:errors.validation';
  end if;

  if v_name_ar is null or v_name_en is null or length(v_name_ar) > 120 or length(v_name_en) > 120 then
    raise exception 'hr:errors.validation' using detail = 'name';
  end if;
  if length(coalesce(v_desc_ar, '')) > 500 or length(coalesce(v_desc_en, '')) > 500 then
    raise exception 'hr:errors.validation' using detail = 'description';
  end if;
  if v_category !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'hr:errors.validation' using detail = 'category';
  end if;
  if v_icon !~ '^[a-z0-9][a-z0-9-]{0,63}$' then
    raise exception 'hr:errors.validation' using detail = 'icon';
  end if;
  if v_color is not null and v_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'hr:errors.validation' using detail = 'color';
  end if;
  begin
    v_sla := nullif(btrim(coalesce(p_values ->> 'sla_business_days', '')), '')::int;
    v_sort := coalesce(nullif(btrim(coalesce(p_values ->> 'sort_order', '')), '')::int, 0);
  exception when others then
    raise exception 'hr:errors.validation' using detail = 'number';
  end;
  if v_sla is not null and (v_sla < 0 or v_sla > 365) then
    raise exception 'hr:errors.validation' using detail = 'sla_business_days';
  end if;
  if v_sort < 0 or v_sort > 100000 then
    raise exception 'hr:errors.validation' using detail = 'sort_order';
  end if;

  if v_id is null then
    if v_key !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'hr:errors.validation' using detail = 'key';
    end if;
    if exists (select 1 from public.request_types where key = v_key) then
      raise exception 'hr:errors.duplicate' using detail = 'key';
    end if;
    insert into public.request_types (key, category, name_ar, name_en, description_ar, description_en, icon, color,
                                      sla_business_days, requires_manager_approval, requires_hr_approval,
                                      allow_attachments, is_active, sort_order, is_system)
    values (v_key, v_category, v_name_ar, v_name_en, v_desc_ar, v_desc_en, v_icon, v_color,
            v_sla, v_mgr, v_hr, v_attach, v_active, v_sort, false)
    returning id into v_id;
    v_sync := true;
  else
    select * into v_old from public.request_types where id = v_id for update;
    if not found then
      raise exception 'hr:errors.notFound' using errcode = 'P0002';
    end if;
    update public.request_types
    set category = v_category, name_ar = v_name_ar, name_en = v_name_en,
        description_ar = v_desc_ar, description_en = v_desc_en, icon = v_icon, color = v_color,
        sla_business_days = v_sla, requires_manager_approval = v_mgr, requires_hr_approval = v_hr,
        allow_attachments = v_attach, is_active = v_active, sort_order = v_sort
    where id = v_id
      and (category, name_ar, name_en, description_ar, description_en, icon, color, sla_business_days,
           requires_manager_approval, requires_hr_approval, allow_attachments, is_active, sort_order)
          is distinct from
          (v_category, v_name_ar, v_name_en, v_desc_ar, v_desc_en, v_icon, v_color, v_sla,
           v_mgr, v_hr, v_attach, v_active, v_sort);
    v_sync := v_old.requires_manager_approval is distinct from v_mgr
              or v_old.requires_hr_approval is distinct from v_hr
              or private.request_type_workflow(v_id, false) is null;
  end if;

  -- Keep the approval workflow consistent with the flags (manager step first, HR step last).
  if v_sync then
    v_wf := private.request_type_workflow(v_id, true);
    set constraints public.request_workflow_steps_order_unique deferred;
    if v_mgr and not exists (select 1 from public.request_workflow_steps where workflow_id = v_wf and step_type = 'manager') then
      update public.request_workflow_steps set step_order = step_order + 1 where workflow_id = v_wf;
      insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en, can_return, can_reassign)
      values (v_wf, 1, 'manager', 'اعتماد المدير المباشر', 'Direct manager approval', true, true);
    elsif not v_mgr then
      delete from public.request_workflow_steps where workflow_id = v_wf and step_type = 'manager';
    end if;
    if v_hr and not exists (select 1 from public.request_workflow_steps where workflow_id = v_wf and step_type = 'hr') then
      insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en, can_return, can_reassign)
      values (v_wf, coalesce((select max(step_order) from public.request_workflow_steps where workflow_id = v_wf), 0) + 1,
              'hr', 'مراجعة الموارد البشرية', 'HR review', true, true);
    elsif not v_hr then
      delete from public.request_workflow_steps where workflow_id = v_wf and step_type = 'hr';
    end if;
    perform private.renumber_workflow_steps(v_wf);
    if not exists (select 1 from public.request_workflow_steps where workflow_id = v_wf) then
      raise exception 'hr:errors.approvalStepRequired';
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_request_type(uuid, jsonb) from public, anon;
grant execute on function public.save_request_type(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- duplicate_request_type: copy with fields + workflow; the copy starts inactive and non-system.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.duplicate_request_type(p_source_id uuid, p_key text, p_name_ar text, p_name_en text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src     public.request_types;
  v_key     text := lower(btrim(coalesce(p_key, '')));
  v_name_ar text := private.nullif_blank(p_name_ar);
  v_name_en text := private.nullif_blank(p_name_en);
  v_id      uuid;
  v_src_wf  uuid;
  v_wf      uuid;
begin
  perform private.assert_settings_edit();
  select * into v_src from public.request_types where id = p_source_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_key !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'hr:errors.validation' using detail = 'key';
  end if;
  if v_name_ar is null or v_name_en is null or length(v_name_ar) > 120 or length(v_name_en) > 120 then
    raise exception 'hr:errors.validation' using detail = 'name';
  end if;
  if exists (select 1 from public.request_types where key = v_key) then
    raise exception 'hr:errors.duplicate' using detail = 'key';
  end if;

  insert into public.request_types (key, category, name_ar, name_en, description_ar, description_en, icon, color,
                                    sla_business_days, requires_manager_approval, requires_hr_approval,
                                    allow_attachments, is_active, sort_order, is_system)
  values (v_key, v_src.category, v_name_ar, v_name_en, v_src.description_ar, v_src.description_en, v_src.icon, v_src.color,
          v_src.sla_business_days, v_src.requires_manager_approval, v_src.requires_hr_approval,
          v_src.allow_attachments, false, v_src.sort_order + 1, false)
  returning id into v_id;

  insert into public.request_fields (request_type_id, key, field_type, label_ar, label_en, help_ar, help_en,
                                     placeholder_ar, placeholder_en, required, options, sort_order, visibility,
                                     validation, is_active, is_system)
  select v_id, f.key, f.field_type, f.label_ar, f.label_en, f.help_ar, f.help_en, f.placeholder_ar, f.placeholder_en,
         f.required, f.options, f.sort_order, f.visibility, f.validation, f.is_active, false
  from public.request_fields f
  where f.request_type_id = v_src.id;

  v_src_wf := private.request_type_workflow(v_src.id, false);
  if v_src_wf is not null and exists (select 1 from public.request_workflow_steps where workflow_id = v_src_wf) then
    insert into public.request_workflows (request_type_id, name_ar, name_en, is_active)
    values (v_id, v_name_ar, v_name_en, true)
    returning id into v_wf;
    insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en, approver_role_key,
                                               approver_user_id, sla_business_days, can_return, can_reassign)
    select v_wf, s.step_order, s.step_type, s.name_ar, s.name_en, s.approver_role_key, s.approver_user_id,
           s.sla_business_days, s.can_return, s.can_reassign
    from public.request_workflow_steps s
    where s.workflow_id = v_src_wf;
    update public.request_types set workflow_id = v_wf where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.duplicate_request_type(uuid, text, text, text) from public, anon;
grant execute on function public.duplicate_request_type(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- save_request_fields: the complete ordered field list of one type.
-- Element: { id?, key, field_type, label_ar, label_en, help_ar, help_en, placeholder_ar, placeholder_en,
--            required, is_active, options[], visibility|null, validation{} }
-- Rules: system fields cannot be removed, re-keyed, re-typed or deactivated; a key that already holds
-- request values cannot change and its field cannot be removed (deactivate it instead); visibility
-- rules may only reference fields of the same form (or `subtype`).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_request_fields(p_request_type_id uuid, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type     public.request_types;
  v_el       jsonb;
  v_ord      bigint;
  v_id       uuid;
  v_old      public.request_fields;
  v_key      text;
  v_ftype    text;
  v_label_ar text;
  v_label_en text;
  v_options  jsonb;
  v_vis      jsonb;
  v_val      jsonb;
  v_keys     text[] := '{}';
  v_ids      uuid[] := '{}';
  v_ref      text;
  v_opt      jsonb;
  v_values   text[];
  v_inserted int := 0;
  v_updated  int := 0;
  v_deleted  int := 0;
  v_n        int;
begin
  perform private.assert_settings_edit();
  select * into v_type from public.request_types where id = p_request_type_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 80 then
    raise exception 'hr:errors.validation' using detail = 'fields';
  end if;

  -- Pass 1: validate every element and collect keys / ids.
  for v_el, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_fields) with ordinality e loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'hr:errors.validation' using detail = 'field';
    end if;
    v_key := btrim(coalesce(v_el ->> 'key', ''));
    v_ftype := coalesce(v_el ->> 'field_type', '');
    v_label_ar := private.nullif_blank(v_el ->> 'label_ar');
    v_label_en := private.nullif_blank(v_el ->> 'label_en');
    if v_key !~ '^[a-z][a-z0-9_]{0,62}$' then
      raise exception 'hr:errors.validation' using detail = 'key';
    end if;
    if v_key = any (v_keys) then
      raise exception 'hr:errors.duplicate' using detail = 'key';
    end if;
    v_keys := v_keys || v_key;
    if v_ftype not in ('short_text', 'long_text', 'number', 'currency', 'date', 'datetime', 'time', 'dropdown',
                       'multi_select', 'yes_no', 'attachment', 'leave_type', 'dependent', 'employee', 'email', 'phone') then
      raise exception 'hr:errors.validation' using detail = 'field_type';
    end if;
    if v_label_ar is null or v_label_en is null or length(v_label_ar) > 200 or length(v_label_en) > 200 then
      raise exception 'hr:errors.validation' using detail = 'label';
    end if;
    if length(coalesce(v_el ->> 'help_ar', '')) > 500 or length(coalesce(v_el ->> 'help_en', '')) > 500
       or length(coalesce(v_el ->> 'placeholder_ar', '')) > 200 or length(coalesce(v_el ->> 'placeholder_en', '')) > 200 then
      raise exception 'hr:errors.validation' using detail = 'text';
    end if;
    v_options := coalesce(v_el -> 'options', '[]'::jsonb);
    if jsonb_typeof(v_options) <> 'array' then
      raise exception 'hr:errors.validation' using detail = 'options';
    end if;
    if v_ftype in ('dropdown', 'multi_select') then
      if jsonb_array_length(v_options) = 0 or jsonb_array_length(v_options) > 100 then
        raise exception 'hr:errors.validation' using detail = 'options';
      end if;
      v_values := '{}';
      for v_opt in select value from jsonb_array_elements(v_options) loop
        if jsonb_typeof(v_opt) <> 'object'
           or coalesce(v_opt ->> 'value', '') !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'
           or private.nullif_blank(v_opt ->> 'label_ar') is null
           or private.nullif_blank(v_opt ->> 'label_en') is null then
          raise exception 'hr:errors.validation' using detail = 'options';
        end if;
        if (v_opt ->> 'value') = any (v_values) then
          raise exception 'hr:errors.duplicate' using detail = 'option';
        end if;
        v_values := v_values || (v_opt ->> 'value');
      end loop;
    end if;
    v_vis := v_el -> 'visibility';
    if v_vis is not null and jsonb_typeof(v_vis) not in ('object', 'null') then
      raise exception 'hr:errors.validation' using detail = 'visibility';
    end if;
    v_val := coalesce(v_el -> 'validation', '{}'::jsonb);
    if jsonb_typeof(v_val) <> 'object' then
      raise exception 'hr:errors.validation' using detail = 'validation';
    end if;
    v_id := case when coalesce(v_el ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$' then (v_el ->> 'id')::uuid end;
    if v_id is not null then
      if not exists (select 1 from public.request_fields where id = v_id and request_type_id = v_type.id) then
        raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'field';
      end if;
      v_ids := v_ids || v_id;
    end if;
  end loop;

  -- Visibility rules may only reference other fields of this form (or the subtype pseudo-field).
  for v_el in select value from jsonb_array_elements(p_fields) loop
    v_vis := v_el -> 'visibility';
    if v_vis is null or jsonb_typeof(v_vis) <> 'object' then
      continue;
    end if;
    for v_ref in select private.rule_field_refs(v_vis) loop
      if v_ref is null or v_ref = (v_el ->> 'key') or not (v_ref = any (v_keys) or v_ref = 'subtype') then
        raise exception 'hr:errors.invalidVisibilityRule' using detail = coalesce(v_ref, '');
      end if;
    end loop;
  end loop;

  -- Removed fields: system fields and fields holding request values cannot be removed.
  for v_old in select * from public.request_fields f where f.request_type_id = v_type.id and not (f.id = any (v_ids)) loop
    if v_old.is_system then
      raise exception 'hr:errors.systemRecord';
    end if;
    if exists (select 1 from public.hr_request_values v join public.hr_requests r on r.id = v.request_id
               where r.request_type_id = v_type.id and v.field_key = v_old.key)
       or exists (select 1 from public.request_attachments a join public.hr_requests r on r.id = a.request_id
                  where r.request_type_id = v_type.id and a.field_key = v_old.key) then
      raise exception 'hr:errors.inUse' using detail = v_old.key;
    end if;
    delete from public.request_fields where id = v_old.id;
    v_deleted := v_deleted + 1;
  end loop;

  -- Pass 2: update / insert in order.
  for v_el, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_fields) with ordinality e loop
    v_key := btrim(v_el ->> 'key');
    v_ftype := v_el ->> 'field_type';
    v_vis := case when jsonb_typeof(v_el -> 'visibility') = 'object' and v_el -> 'visibility' <> '{}'::jsonb then v_el -> 'visibility' end;
    v_options := case when v_ftype in ('dropdown', 'multi_select') then coalesce(v_el -> 'options', '[]'::jsonb) else '[]'::jsonb end;
    v_val := coalesce(v_el -> 'validation', '{}'::jsonb);
    v_id := case when coalesce(v_el ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$' then (v_el ->> 'id')::uuid end;

    if v_id is not null then
      select * into v_old from public.request_fields where id = v_id;
      if v_old.is_system and (v_old.key is distinct from v_key or v_old.field_type is distinct from v_ftype) then
        raise exception 'hr:errors.systemRecord';
      end if;
      if v_old.key is distinct from v_key
         and (exists (select 1 from public.hr_request_values v join public.hr_requests r on r.id = v.request_id
                      where r.request_type_id = v_type.id and v.field_key = v_old.key)
              or exists (select 1 from public.request_attachments a join public.hr_requests r on r.id = a.request_id
                         where r.request_type_id = v_type.id and a.field_key = v_old.key)) then
        raise exception 'hr:errors.fieldKeyInUse' using detail = v_old.key;
      end if;
      update public.request_fields
      set key = v_key,
          field_type = v_ftype,
          label_ar = btrim(v_el ->> 'label_ar'),
          label_en = btrim(v_el ->> 'label_en'),
          help_ar = private.nullif_blank(v_el ->> 'help_ar'),
          help_en = private.nullif_blank(v_el ->> 'help_en'),
          placeholder_ar = private.nullif_blank(v_el ->> 'placeholder_ar'),
          placeholder_en = private.nullif_blank(v_el ->> 'placeholder_en'),
          required = coalesce((v_el ->> 'required')::boolean, false),
          is_active = case when v_old.is_system then true else coalesce((v_el ->> 'is_active')::boolean, true) end,
          options = v_options,
          visibility = v_vis,
          validation = v_val,
          sort_order = v_ord * 10
      where id = v_id
        and (key, field_type, label_ar, label_en, help_ar, help_en, placeholder_ar, placeholder_en, required, is_active,
             options, visibility, validation, sort_order)
            is distinct from
            (v_key, v_ftype, btrim(v_el ->> 'label_ar'), btrim(v_el ->> 'label_en'),
             private.nullif_blank(v_el ->> 'help_ar'), private.nullif_blank(v_el ->> 'help_en'),
             private.nullif_blank(v_el ->> 'placeholder_ar'), private.nullif_blank(v_el ->> 'placeholder_en'),
             coalesce((v_el ->> 'required')::boolean, false),
             case when v_old.is_system then true else coalesce((v_el ->> 'is_active')::boolean, true) end,
             v_options, v_vis, v_val, (v_ord * 10)::int);
      get diagnostics v_n = row_count;
      v_updated := v_updated + v_n;
    else
      insert into public.request_fields (request_type_id, key, field_type, label_ar, label_en, help_ar, help_en,
                                         placeholder_ar, placeholder_en, required, options, sort_order, visibility,
                                         validation, is_active, is_system)
      values (v_type.id, v_key, v_ftype, btrim(v_el ->> 'label_ar'), btrim(v_el ->> 'label_en'),
              private.nullif_blank(v_el ->> 'help_ar'), private.nullif_blank(v_el ->> 'help_en'),
              private.nullif_blank(v_el ->> 'placeholder_ar'), private.nullif_blank(v_el ->> 'placeholder_en'),
              coalesce((v_el ->> 'required')::boolean, false), v_options, v_ord * 10, v_vis, v_val,
              coalesce((v_el ->> 'is_active')::boolean, true), false);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'deleted', v_deleted);
end;
$$;

revoke execute on function public.save_request_fields(uuid, jsonb) from public, anon;
grant execute on function public.save_request_fields(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- save_request_workflow: the complete ordered step list of one type's workflow.
-- Element: { id?, step_type (manager|hr|role|user), name_ar, name_en, approver_role_key, approver_user_id,
--            sla_business_days, can_return, can_reassign }
-- Also sets request_types.workflow_id and keeps requires_manager_approval / requires_hr_approval in step.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_request_workflow(p_request_type_id uuid, p_steps jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type    public.request_types;
  v_wf      uuid;
  v_el      jsonb;
  v_ord     bigint;
  v_id      uuid;
  v_stype   text;
  v_name_ar text;
  v_name_en text;
  v_role    text;
  v_user    uuid;
  v_sla     int;
  v_ids     uuid[] := '{}';
begin
  perform private.assert_settings_edit();
  select * into v_type from public.request_types where id = p_request_type_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then
    raise exception 'hr:errors.approvalStepRequired';
  end if;
  if jsonb_array_length(p_steps) > 10 then
    raise exception 'hr:errors.validation' using detail = 'steps';
  end if;

  v_wf := private.request_type_workflow(v_type.id, true);

  -- Validate and collect the ids that stay.
  for v_el in select value from jsonb_array_elements(p_steps) loop
    if jsonb_typeof(v_el) <> 'object' then
      raise exception 'hr:errors.validation' using detail = 'step';
    end if;
    v_stype := coalesce(v_el ->> 'step_type', '');
    v_name_ar := private.nullif_blank(v_el ->> 'name_ar');
    v_name_en := private.nullif_blank(v_el ->> 'name_en');
    if v_stype not in ('manager', 'hr', 'role', 'user') then
      raise exception 'hr:errors.validation' using detail = 'step_type';
    end if;
    if v_name_ar is null or v_name_en is null or length(v_name_ar) > 120 or length(v_name_en) > 120 then
      raise exception 'hr:errors.validation' using detail = 'step_name';
    end if;
    if v_stype = 'role' then
      v_role := private.nullif_blank(v_el ->> 'approver_role_key');
      if v_role is null or not exists (select 1 from public.roles where key = v_role) then
        raise exception 'hr:errors.roleNotFound';
      end if;
    end if;
    if v_stype = 'user' then
      v_user := case when coalesce(v_el ->> 'approver_user_id', '') ~ '^[0-9a-fA-F-]{36}$' then (v_el ->> 'approver_user_id')::uuid end;
      if v_user is null or not exists (select 1 from public.profiles where id = v_user and status = 'active') then
        raise exception 'hr:errors.invalidAssignee';
      end if;
    end if;
    begin
      v_sla := nullif(btrim(coalesce(v_el ->> 'sla_business_days', '')), '')::int;
    exception when others then
      raise exception 'hr:errors.validation' using detail = 'sla_business_days';
    end;
    if v_sla is not null and (v_sla < 0 or v_sla > 365) then
      raise exception 'hr:errors.validation' using detail = 'sla_business_days';
    end if;
    v_id := case when coalesce(v_el ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$' then (v_el ->> 'id')::uuid end;
    if v_id is not null and exists (select 1 from public.request_workflow_steps where id = v_id and workflow_id = v_wf) then
      v_ids := v_ids || v_id;
    end if;
  end loop;

  set constraints public.request_workflow_steps_order_unique deferred;
  delete from public.request_workflow_steps where workflow_id = v_wf and not (id = any (v_ids));

  for v_el, v_ord in select e.value, e.ordinality from jsonb_array_elements(p_steps) with ordinality e loop
    v_stype := v_el ->> 'step_type';
    v_role := case when v_stype = 'role' then private.nullif_blank(v_el ->> 'approver_role_key') end;
    v_user := case when v_stype = 'user' then (v_el ->> 'approver_user_id')::uuid end;
    v_sla := nullif(btrim(coalesce(v_el ->> 'sla_business_days', '')), '')::int;
    v_id := case when coalesce(v_el ->> 'id', '') ~ '^[0-9a-fA-F-]{36}$' then (v_el ->> 'id')::uuid end;
    if v_id is not null and v_id = any (v_ids) then
      update public.request_workflow_steps
      set step_order = v_ord, step_type = v_stype,
          name_ar = btrim(v_el ->> 'name_ar'), name_en = btrim(v_el ->> 'name_en'),
          approver_role_key = v_role, approver_user_id = v_user, sla_business_days = v_sla,
          can_return = coalesce((v_el ->> 'can_return')::boolean, true),
          can_reassign = coalesce((v_el ->> 'can_reassign')::boolean, true)
      where id = v_id
        and (step_order, step_type, name_ar, name_en, approver_role_key, approver_user_id, sla_business_days, can_return, can_reassign)
            is distinct from
            (v_ord::int, v_stype, btrim(v_el ->> 'name_ar'), btrim(v_el ->> 'name_en'), v_role, v_user, v_sla,
             coalesce((v_el ->> 'can_return')::boolean, true), coalesce((v_el ->> 'can_reassign')::boolean, true));
    else
      insert into public.request_workflow_steps (workflow_id, step_order, step_type, name_ar, name_en, approver_role_key,
                                                 approver_user_id, sla_business_days, can_return, can_reassign)
      values (v_wf, v_ord, v_stype, btrim(v_el ->> 'name_ar'), btrim(v_el ->> 'name_en'), v_role, v_user, v_sla,
              coalesce((v_el ->> 'can_return')::boolean, true), coalesce((v_el ->> 'can_reassign')::boolean, true));
    end if;
  end loop;
  set constraints public.request_workflow_steps_order_unique immediate;

  perform private.renumber_workflow_steps(v_wf);

  update public.request_types t
  set requires_manager_approval = exists (select 1 from public.request_workflow_steps s where s.workflow_id = v_wf and s.step_type = 'manager'),
      requires_hr_approval = exists (select 1 from public.request_workflow_steps s where s.workflow_id = v_wf and s.step_type = 'hr'),
      workflow_id = v_wf
  where t.id = v_type.id
    and (t.requires_manager_approval, t.requires_hr_approval, t.workflow_id) is distinct from
        (exists (select 1 from public.request_workflow_steps s where s.workflow_id = v_wf and s.step_type = 'manager'),
         exists (select 1 from public.request_workflow_steps s where s.workflow_id = v_wf and s.step_type = 'hr'),
         v_wf);

  return v_wf;
end;
$$;

revoke execute on function public.save_request_workflow(uuid, jsonb) from public, anon;
grant execute on function public.save_request_workflow(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- request_type_usage: per-type counts and SLA performance (aggregates only, drafts excluded).
--   resolved = reached a final decision (approved/in_progress/completed/rejected) with a due date;
--   on time  = the first approval/rejection decision happened at or before due_at.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.request_type_usage()
returns table (
  request_type_id uuid,
  total bigint,
  open bigint,
  overdue_open bigint,
  resolved bigint,
  resolved_on_time bigint,
  last_submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() or not private.has_org_permission('settings', 'view') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return query
    with decided as (
      select r.id, r.request_type_id, r.status, r.due_at, r.submitted_at,
             (select min(h.created_at) from public.request_history h
               where h.request_id = r.id and h.to_status in ('approved', 'rejected')) as decided_at
      from public.hr_requests r
      where r.status <> 'draft'
    )
    select d.request_type_id,
           count(*)::bigint,
           count(*) filter (where d.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'returned'))::bigint,
           count(*) filter (where d.status in ('submitted', 'pending_manager_approval', 'pending_hr_review')
                              and d.due_at is not null and d.due_at < now())::bigint,
           count(*) filter (where d.status in ('approved', 'in_progress', 'completed', 'rejected')
                              and d.due_at is not null and d.decided_at is not null)::bigint,
           count(*) filter (where d.status in ('approved', 'in_progress', 'completed', 'rejected')
                              and d.due_at is not null and d.decided_at is not null and d.decided_at <= d.due_at)::bigint,
           max(d.submitted_at)
    from decided d
    group by d.request_type_id;
end;
$$;

revoke execute on function public.request_type_usage() from public, anon;
grant execute on function public.request_type_usage() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- request_field_usage: field keys of one type that hold stored values / attachments (drafts included —
-- a draft's values would be orphaned by a key change too).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.request_field_usage(p_request_type_id uuid)
returns table (field_key text, uses bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() or not private.has_org_permission('settings', 'view') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return query
    select u.field_key, count(distinct u.request_id)::bigint
    from (
      select v.field_key, v.request_id
      from public.hr_request_values v join public.hr_requests r on r.id = v.request_id
      where r.request_type_id = p_request_type_id
      union all
      select a.field_key, a.request_id
      from public.request_attachments a join public.hr_requests r on r.id = a.request_id
      where r.request_type_id = p_request_type_id and a.field_key is not null
    ) u
    group by u.field_key;
end;
$$;

revoke execute on function public.request_field_usage(uuid) from public, anon;
grant execute on function public.request_field_usage(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- email_log_links: related record of e-mail log rows written for notifications (the notification's
-- in-app link and type). Readers of email_logs only (settings.view / audit.view).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.email_log_links(p_notification_ids uuid[])
returns table (notification_id uuid, type text, link text, entity_type text, entity_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user()
     or not (private.has_org_permission('settings', 'view') or private.has_org_permission('audit', 'view')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_notification_ids is null or cardinality(p_notification_ids) = 0 then
    return;
  end if;
  return query
    select n.id, n.type, n.link, n.entity_type, n.entity_id
    from public.notifications n
    where n.id = any (p_notification_ids[1:200]);
end;
$$;

revoke execute on function public.email_log_links(uuid[]) from public, anon;
grant execute on function public.email_log_links(uuid[]) to authenticated, service_role;
