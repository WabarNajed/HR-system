-- =====================================================================================================
-- HR Portal — numbering, leave-day math and the request workflow engine
-- Public RPCs: next_document_number, count_leave_days, create_request_draft, update_request_draft,
--              submit_request, act_on_request, add_request_comment, get_request_workflow
-- Application errors are raised as 'hr:errors.<key>' (DETAIL carries the field key where relevant).
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Document numbers: HR-YYYY-000001 / CERT-YYYY-000001 (concurrency-safe: one upserted row per prefix+year)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year  int := extract(year from private.org_today())::int;
  v_value int;
begin
  if p_prefix is null or p_prefix not in ('HR', 'CERT') then
    raise exception 'hr:errors.validation' using detail = 'prefix';
  end if;
  insert into public.document_sequences as ds (prefix, year, last_value)
  values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = ds.last_value + 1
  returning ds.last_value into v_value;
  return p_prefix || '-' || v_year::text || '-' ||
         case when v_value < 1000000 then lpad(v_value::text, 6, '0') else v_value::text end;
end;
$$;

create or replace function public.next_document_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_prefix is null or p_prefix not in ('HR', 'CERT') then
    raise exception 'hr:errors.validation' using detail = 'prefix';
  end if;
  if (p_prefix = 'CERT' and private.has_org_permission('certificates', 'create'))
     or (p_prefix = 'HR' and private.has_org_permission('requests', 'edit')) then
    return private.next_document_number(p_prefix);
  end if;
  raise exception 'hr:errors.forbidden' using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Leave day counting (working: skips weekend days + active public holidays; calendar: every day)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.count_leave_days(p_leave_type_id uuid, p_start date, p_end date)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis text;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return 0;
  end if;
  if p_end - p_start > 400 then
    raise exception 'hr:errors.invalidDateRange' using detail = 'range_too_long';
  end if;
  select lt.day_count_basis into v_basis from public.leave_types lt where lt.id = p_leave_type_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'leave_type';
  end if;
  if v_basis = 'calendar' then
    return (p_end - p_start + 1)::numeric;
  end if;
  return (
    select count(*)::numeric
    from generate_series(p_start, p_end, interval '1 day') as d
    where private.is_business_day(d::date)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Dynamic form helpers
-- ---------------------------------------------------------------------------------------------------
create or replace function private.jsonb_matches_any(p_value jsonb, p_candidates jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and p_value <> 'null'::jsonb and exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(p_candidates) = 'array' then p_candidates else '[]'::jsonb end) as c(v)
    where c.v = p_value
       or (c.v #>> '{}') = (p_value #>> '{}')
       or (jsonb_typeof(p_value) = 'array' and p_value @> jsonb_build_array(c.v))
  )
$$;

-- Visibility rule evaluation (must match the UI evaluator):
--   null → visible · {"field": k, "in": [..]} · {"field": k, "not_in": [..]} · {"all": [..]} · {"any": [..]}
-- The pseudo-field "subtype" reads hr_requests.subtype.
create or replace function private.field_visible(p_rule jsonb, p_subtype text, p_values jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rule  jsonb;
  v_value jsonb;
begin
  if p_rule is null or p_rule = 'null'::jsonb or p_rule = '{}'::jsonb then
    return true;
  end if;
  if p_rule ? 'all' then
    for v_rule in select jsonb_array_elements(p_rule -> 'all') loop
      if not private.field_visible(v_rule, p_subtype, p_values) then
        return false;
      end if;
    end loop;
    return true;
  end if;
  if p_rule ? 'any' then
    for v_rule in select jsonb_array_elements(p_rule -> 'any') loop
      if private.field_visible(v_rule, p_subtype, p_values) then
        return true;
      end if;
    end loop;
    return false;
  end if;
  v_value := case when p_rule ->> 'field' = 'subtype' then to_jsonb(p_subtype)
                  else coalesce(p_values, '{}'::jsonb) -> (p_rule ->> 'field') end;
  if p_rule ? 'in' then
    return private.jsonb_matches_any(v_value, p_rule -> 'in');
  end if;
  if p_rule ? 'not_in' then
    return not private.jsonb_matches_any(v_value, p_rule -> 'not_in');
  end if;
  return true;
end;
$$;

-- Validates + normalises one submitted value for a field. Returns NULL for "empty".
create or replace function private.normalize_field_value(p_field public.request_fields, p_value jsonb, p_employee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_text   text;
  v_num    numeric;
  v_date   date;
  v_time   time;
  v_ts     timestamptz;
  v_bool   boolean;
  v_uuid   uuid;
  v_elem   jsonb;
  v_opts   jsonb := coalesce(p_field.options, '[]'::jsonb);
  v_valid  jsonb := coalesce(p_field.validation, '{}'::jsonb);
begin
  if p_value is null or p_value = 'null'::jsonb or p_value = '""'::jsonb or p_value = '[]'::jsonb or p_value = '{}'::jsonb then
    return null;
  end if;
  if jsonb_typeof(p_value) in ('string', 'number', 'boolean') then
    v_text := btrim(p_value #>> '{}');
    if v_text = '' then
      return null;
    end if;
  end if;

  case p_field.field_type
    when 'short_text', 'long_text' then
      if v_text is null or length(v_text) > (case when p_field.field_type = 'short_text' then 500 else 10000 end) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      if v_valid ? 'pattern' and v_text !~ (v_valid ->> 'pattern') then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_text);
    when 'phone' then
      if v_text is null or v_text !~ '^\+?[0-9 ()\-]{5,20}$' then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_text);
    when 'email' then
      if v_text is null or v_text !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(lower(v_text));
    when 'number', 'currency' then
      begin
        v_num := v_text::numeric;
      exception when others then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end;
      if v_num is null
         or (v_valid ? 'min' and v_num < (v_valid ->> 'min')::numeric)
         or (v_valid ? 'max' and v_num > (v_valid ->> 'max')::numeric)
         or (p_field.field_type = 'currency' and v_num < 0) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_num);
    when 'date' then
      begin
        v_date := v_text::date;
      exception when others then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end;
      return to_jsonb(to_char(v_date, 'YYYY-MM-DD'));
    when 'datetime' then
      begin
        v_ts := v_text::timestamptz;
      exception when others then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end;
      return to_jsonb(v_ts);
    when 'time' then
      begin
        v_time := v_text::time;
      exception when others then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end;
      return to_jsonb(to_char(v_time, 'HH24:MI'));
    when 'yes_no' then
      if lower(v_text) in ('true', 'yes', '1') then
        v_bool := true;
      elsif lower(v_text) in ('false', 'no', '0') then
        v_bool := false;
      else
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_bool);
    when 'dropdown' then
      if v_text is null then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      if jsonb_array_length(v_opts) > 0
         and not exists (select 1 from jsonb_array_elements(v_opts) o where o ->> 'value' = v_text) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_text);
    when 'multi_select' then
      if jsonb_typeof(p_value) <> 'array' then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      for v_elem in select jsonb_array_elements(p_value) loop
        if jsonb_array_length(v_opts) > 0
           and not exists (select 1 from jsonb_array_elements(v_opts) o where o ->> 'value' = v_elem #>> '{}') then
          raise exception 'hr:errors.validation' using detail = p_field.key;
        end if;
      end loop;
      return p_value;
    when 'leave_type' then
      v_uuid := private.try_uuid(v_text);
      if v_uuid is null or not exists (select 1 from public.leave_types lt where lt.id = v_uuid and lt.is_active) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_uuid);
    when 'employee' then
      v_uuid := private.try_uuid(v_text);
      if v_uuid is null or not exists (select 1 from public.employees e where e.id = v_uuid) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_uuid);
    when 'dependent' then
      v_uuid := private.try_uuid(v_text);
      if v_uuid is null or not exists (
        select 1 from public.employee_dependents d where d.id = v_uuid and d.employee_id = p_employee_id
      ) then
        raise exception 'hr:errors.validation' using detail = p_field.key;
      end if;
      return to_jsonb(v_uuid);
    when 'attachment' then
      return p_value; -- attachment ids/paths; files themselves live in request_attachments
    else
      return p_value;
  end case;
end;
$$;

-- Saves values for a request. p_replace = true removes values not present in p_values.
create or replace function private.save_request_values(p_request_id uuid, p_values jsonb, p_replace boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    public.hr_requests;
  v_field  public.request_fields;
  v_key    text;
  v_value  jsonb;
  v_norm   jsonb;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  if p_values is null then
    p_values := '{}'::jsonb;
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'hr:errors.validation' using detail = 'values';
  end if;
  for v_key, v_value in select * from jsonb_each(p_values) loop
    continue when v_key = 'subtype'; -- stored on hr_requests.subtype
    select * into v_field from public.request_fields f
    where f.request_type_id = v_req.request_type_id and f.key = v_key and f.is_active;
    if not found then
      raise exception 'hr:errors.validation' using detail = v_key;
    end if;
    v_norm := private.normalize_field_value(v_field, v_value, v_req.employee_id);
    if v_norm is null then
      delete from public.hr_request_values where request_id = p_request_id and field_key = v_key;
    else
      insert into public.hr_request_values (request_id, field_key, value)
      values (p_request_id, v_key, v_norm)
      on conflict (request_id, field_key) do update set value = excluded.value;
    end if;
  end loop;
  if p_replace then
    delete from public.hr_request_values v
    where v.request_id = p_request_id
      and v.field_key <> 'days'
      and not (p_values ? v.field_key);
  end if;
end;
$$;

create or replace function private.request_values(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(v.field_key, v.value), '{}'::jsonb)
  from public.hr_request_values v where v.request_id = p_request_id
$$;

create or replace function private.validate_subtype(p_request_type_id uuid, p_subtype text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_field public.request_fields;
begin
  select * into v_field from public.request_fields f
  where f.request_type_id = p_request_type_id and f.key = 'subtype' and f.is_active;
  if not found then
    if p_subtype is not null then
      raise exception 'hr:errors.validation' using detail = 'subtype';
    end if;
    return;
  end if;
  if p_subtype is not null and jsonb_array_length(v_field.options) > 0
     and not exists (select 1 from jsonb_array_elements(v_field.options) o where o ->> 'value' = p_subtype) then
    raise exception 'hr:errors.validation' using detail = 'subtype';
  end if;
end;
$$;

-- Short human summary shown in lists (user-entered text; leave → date range).
create or replace function private.compute_request_title(p_request_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with v as (select private.request_values(p_request_id) as j)
  select left(coalesce(
    case when (v.j ? 'start_date') and (v.j ? 'end_date')
         then (v.j ->> 'start_date') || ' → ' || (v.j ->> 'end_date') end,
    v.j ->> 'subject', v.j ->> 'purpose', v.j ->> 'destination_city', v.j ->> 'addressed_to',
    v.j ->> 'issue_description', v.j ->> 'description', v.j ->> 'details', v.j ->> 'requested_value',
    v.j ->> 'reason', v.j ->> 'comments'
  ), 140)
  from v
$$;

create or replace function private.validate_request_for_submit(p_request_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_req    public.hr_requests;
  v_values jsonb;
  v_field  public.request_fields;
  v_type   public.request_types;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  select * into v_type from public.request_types where id = v_req.request_type_id;
  v_values := private.request_values(p_request_id);

  if exists (select 1 from public.request_fields f
             where f.request_type_id = v_req.request_type_id and f.key = 'subtype' and f.is_active and f.required)
     and v_req.subtype is null then
    raise exception 'hr:errors.requiredFieldMissing' using detail = 'subtype';
  end if;

  for v_field in
    select * from public.request_fields f
    where f.request_type_id = v_req.request_type_id and f.is_active and f.required and f.key <> 'subtype'
    order by f.sort_order
  loop
    continue when not private.field_visible(v_field.visibility, v_req.subtype, v_values);
    if v_field.field_type = 'attachment' then
      if not (v_values ? v_field.key) and not exists (
        select 1 from public.request_attachments a
        where a.request_id = p_request_id and (a.field_key = v_field.key or a.field_key is null)
      ) then
        raise exception 'hr:errors.requiredFieldMissing' using detail = v_field.key;
      end if;
    elsif not (v_values ? v_field.key) then
      raise exception 'hr:errors.requiredFieldMissing' using detail = v_field.key;
    end if;
  end loop;

  if not v_type.allow_attachments and exists (select 1 from public.request_attachments a where a.request_id = p_request_id) then
    raise exception 'hr:errors.validation' using detail = 'attachments';
  end if;

  -- type-specific checks for built-in effects
  if v_type.key = 'employee_info_update' and v_req.subtype = 'email'
     and coalesce(v_values ->> 'requested_value', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'hr:errors.validation' using detail = 'requested_value';
  end if;
  if v_type.key = 'bank_update'
     and upper(regexp_replace(coalesce(v_values ->> 'iban', ''), '\s', '', 'g')) !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    raise exception 'hr:errors.validation' using detail = 'iban';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Leave balance effects (state machine on leave_requests.balance_effect)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.is_leave_request_type(p_request_type_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.request_types t where t.id = p_request_type_id and t.key = 'leave'
  ) or exists (
    select 1 from public.request_fields f
    where f.request_type_id = p_request_type_id and f.key = 'leave_type' and f.field_type = 'leave_type' and f.is_active
  )
$$;

create or replace function private.ensure_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.leave_balances (employee_id, leave_type_id, year, entitlement)
  select p_employee_id, lt.id, p_year, lt.default_entitlement
  from public.leave_types lt where lt.id = p_leave_type_id
  on conflict (employee_id, leave_type_id, year) do nothing;
  select b.id into v_id from public.leave_balances b
  where b.employee_id = p_employee_id and b.leave_type_id = p_leave_type_id and b.year = p_year;
  return v_id;
end;
$$;

-- Validates a leave request and moves its balance effect none → pending (deducting types).
create or replace function private.prepare_leave_on_submit(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req     public.hr_requests;
  v_values  jsonb;
  v_lt      public.leave_types;
  v_start   date;
  v_end     date;
  v_return  date;
  v_days    numeric;
  v_gender  text;
  v_year    int;
  v_bal     public.leave_balances;
  v_bal_id  uuid;
  v_effect  text;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  v_values := private.request_values(p_request_id);

  select * into v_lt from public.leave_types lt
  where lt.id = private.try_uuid(v_values ->> 'leave_type') and lt.is_active;
  if not found then
    raise exception 'hr:errors.requiredFieldMissing' using detail = 'leave_type';
  end if;
  if not (v_values ? 'start_date') then
    raise exception 'hr:errors.requiredFieldMissing' using detail = 'start_date';
  end if;
  if not (v_values ? 'end_date') then
    raise exception 'hr:errors.requiredFieldMissing' using detail = 'end_date';
  end if;
  v_start := (v_values ->> 'start_date')::date;
  v_end := (v_values ->> 'end_date')::date;
  if v_end < v_start then
    raise exception 'hr:errors.invalidDateRange' using detail = 'end_date';
  end if;

  select e.gender into v_gender from public.employees e where e.id = v_req.employee_id;
  if v_lt.gender_restriction is not null and v_gender is distinct from v_lt.gender_restriction then
    raise exception 'hr:errors.leaveGenderRestricted' using detail = 'leave_type';
  end if;

  v_days := public.count_leave_days(v_lt.id, v_start, v_end);
  if v_days <= 0 then
    raise exception 'hr:errors.invalidDateRange' using detail = 'no_working_days';
  end if;
  if v_lt.max_days_per_request is not null and v_days > v_lt.max_days_per_request then
    raise exception 'hr:errors.leaveMaxDaysExceeded' using detail = v_lt.max_days_per_request::text;
  end if;
  if v_lt.requires_attachment and not exists (select 1 from public.request_attachments a where a.request_id = p_request_id) then
    raise exception 'hr:errors.attachmentRequired' using detail = 'attachment';
  end if;
  if exists (
    select 1
    from public.leave_requests lr
    join public.hr_requests h on h.id = lr.request_id
    where lr.employee_id = v_req.employee_id
      and lr.request_id <> p_request_id
      and h.status not in ('draft', 'rejected', 'cancelled')
      and lr.balance_effect <> 'reversed'
      and lr.start_date <= v_end
      and lr.end_date >= v_start
  ) then
    raise exception 'hr:errors.overlappingLeave';
  end if;

  v_year := extract(year from v_start)::int;
  v_return := coalesce((v_values ->> 'return_date')::date, private.add_business_days(v_end, 1));
  if v_return < v_end then
    raise exception 'hr:errors.invalidDateRange' using detail = 'return_date';
  end if;

  select lr.balance_effect into v_effect from public.leave_requests lr where lr.request_id = p_request_id for update;
  if found and v_effect in ('pending', 'used') then
    raise exception 'hr:errors.invalidTransition' using detail = 'balance_effect=' || v_effect;
  end if;

  insert into public.leave_requests (request_id, employee_id, leave_type_id, start_date, end_date, return_date, days, year, balance_effect)
  values (p_request_id, v_req.employee_id, v_lt.id, v_start, v_end, v_return, v_days, v_year, 'none')
  on conflict (request_id) do update
    set employee_id = excluded.employee_id, leave_type_id = excluded.leave_type_id, start_date = excluded.start_date,
        end_date = excluded.end_date, return_date = excluded.return_date, days = excluded.days, year = excluded.year,
        balance_effect = 'none';

  insert into public.hr_request_values (request_id, field_key, value)
  values (p_request_id, 'days', to_jsonb(v_days))
  on conflict (request_id, field_key) do update set value = excluded.value;

  if v_lt.deducts_balance then
    -- ensure first (a function call inside the WHERE clause would not run against an empty table)
    v_bal_id := private.ensure_leave_balance(v_req.employee_id, v_lt.id, v_year);
    select * into v_bal from public.leave_balances b where b.id = v_bal_id for update;
    if v_bal.remaining - v_bal.pending < v_days then
      raise exception 'hr:errors.insufficientBalance'
        using detail = jsonb_build_object('available', v_bal.remaining - v_bal.pending, 'requested', v_days)::text;
    end if;
    update public.leave_balances set pending = pending + v_days where id = v_bal.id;
    update public.leave_requests set balance_effect = 'pending' where request_id = p_request_id;
  end if;
end;
$$;

-- pending → used on final approval (none → used for deducting types without a pending hold)
create or replace function private.leave_consume(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lr     public.leave_requests;
  v_lt     public.leave_types;
  v_bal    public.leave_balances;
  v_bal_id uuid;
begin
  select * into v_lr from public.leave_requests where request_id = p_request_id for update;
  if not found then
    return null;
  end if;
  select * into v_lt from public.leave_types where id = v_lr.leave_type_id;
  if v_lr.balance_effect = 'pending' or (v_lr.balance_effect = 'none' and v_lt.deducts_balance) then
    v_bal_id := private.ensure_leave_balance(v_lr.employee_id, v_lr.leave_type_id, v_lr.year);
    select * into v_bal from public.leave_balances b where b.id = v_bal_id for update;
    if v_bal.remaining < v_lr.days then
      raise exception 'hr:errors.insufficientBalance'
        using detail = jsonb_build_object('available', v_bal.remaining, 'requested', v_lr.days)::text;
    end if;
    update public.leave_balances
    set pending = pending - case when v_lr.balance_effect = 'pending' then v_lr.days else 0 end,
        used = used + v_lr.days
    where id = v_bal.id;
    update public.leave_requests set balance_effect = 'used' where id = v_lr.id;
    return jsonb_build_object('balance_effect', jsonb_build_object('old', v_lr.balance_effect, 'new', 'used'),
                              'days', v_lr.days, 'leave_type_id', v_lr.leave_type_id, 'year', v_lr.year);
  end if;
  return jsonb_build_object('balance_effect', jsonb_build_object('old', v_lr.balance_effect, 'new', v_lr.balance_effect),
                            'days', v_lr.days);
end;
$$;

-- Releases a hold/usage. p_reason: 'return' (pending → none), 'reject' / 'cancel' (pending → reversed),
-- 'cancel' after approval (used → reversed).
create or replace function private.leave_release(p_request_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lr  public.leave_requests;
  v_new text;
begin
  select * into v_lr from public.leave_requests where request_id = p_request_id for update;
  if not found then
    return null;
  end if;
  if v_lr.balance_effect = 'pending' then
    update public.leave_balances set pending = pending - v_lr.days
    where employee_id = v_lr.employee_id and leave_type_id = v_lr.leave_type_id and year = v_lr.year;
    v_new := case when p_reason = 'return' then 'none' else 'reversed' end;
  elsif v_lr.balance_effect = 'used' and p_reason = 'cancel' then
    update public.leave_balances set used = used - v_lr.days
    where employee_id = v_lr.employee_id and leave_type_id = v_lr.leave_type_id and year = v_lr.year;
    v_new := 'reversed';
  else
    return null;
  end if;
  update public.leave_requests set balance_effect = v_new where id = v_lr.id;
  return jsonb_build_object('balance_effect', jsonb_build_object('old', v_lr.balance_effect, 'new', v_new), 'days', v_lr.days);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Effects applied on final approval
-- ---------------------------------------------------------------------------------------------------
create or replace function private.mask_tail(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_value is null then null
              when length(p_value) <= 4 then '****'
              else '****' || right(p_value, 4) end
$$;

create or replace function private.apply_bank_update(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req     public.hr_requests;
  v_values  jsonb;
  v_old     public.employee_bank_accounts;
  v_bank    text;
  v_iban    text;
  v_holder  text;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  v_values := private.request_values(p_request_id);
  v_bank := private.nullif_blank(v_values ->> 'bank_name');
  v_iban := nullif(upper(regexp_replace(coalesce(v_values ->> 'iban', ''), '\s', '', 'g')), '');
  v_holder := private.nullif_blank(v_values ->> 'account_holder');
  if v_iban is null then
    raise exception 'hr:errors.requiredFieldMissing' using detail = 'iban';
  end if;

  select * into v_old from public.employee_bank_accounts b
  where b.employee_id = v_req.employee_id and b.is_primary
  for update;
  if found then
    update public.employee_bank_accounts
    set bank_name = coalesce(v_bank, bank_name), iban = v_iban, account_holder = coalesce(v_holder, account_holder)
    where id = v_old.id;
  else
    insert into public.employee_bank_accounts (employee_id, bank_name, iban, account_holder, is_primary)
    values (v_req.employee_id, v_bank, v_iban, v_holder, true);
  end if;
  return jsonb_build_object('bank_account', jsonb_build_object(
    'bank_name', jsonb_build_object('old', v_old.bank_name, 'new', coalesce(v_bank, v_old.bank_name)),
    'iban', jsonb_build_object('old', private.mask_tail(v_old.iban), 'new', private.mask_tail(v_iban)),
    'account_holder', jsonb_build_object('old', v_old.account_holder, 'new', coalesce(v_holder, v_old.account_holder))
  ));
end;
$$;

create or replace function private.apply_employee_info_update(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req     public.hr_requests;
  v_values  jsonb;
  v_emp     public.employees;
  v_new     text;
  v_changes jsonb := '{}'::jsonb;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  select * into v_emp from public.employees where id = v_req.employee_id for update;
  v_values := private.request_values(p_request_id);
  v_new := private.nullif_blank(v_values ->> 'requested_value');

  case v_req.subtype
    when 'mobile' then
      if v_new is null then raise exception 'hr:errors.requiredFieldMissing' using detail = 'requested_value'; end if;
      update public.employees set mobile = v_new where id = v_emp.id;
      v_changes := jsonb_build_object('mobile', jsonb_build_object('old', v_emp.mobile, 'new', v_new));
    when 'email' then
      if v_new is null then raise exception 'hr:errors.requiredFieldMissing' using detail = 'requested_value'; end if;
      update public.employees set personal_email = lower(v_new) where id = v_emp.id;
      v_changes := jsonb_build_object('personal_email', jsonb_build_object('old', v_emp.personal_email, 'new', lower(v_new)));
    when 'address' then
      if v_new is null then raise exception 'hr:errors.requiredFieldMissing' using detail = 'requested_value'; end if;
      update public.employees set address = v_new where id = v_emp.id;
      v_changes := jsonb_build_object('address', jsonb_build_object('old', v_emp.address, 'new', v_new));
    when 'marital_status' then
      v_new := v_values ->> 'requested_marital_status';
      if v_new is null then raise exception 'hr:errors.requiredFieldMissing' using detail = 'requested_marital_status'; end if;
      update public.employees set marital_status = v_new where id = v_emp.id;
      v_changes := jsonb_build_object('marital_status', jsonb_build_object('old', v_emp.marital_status, 'new', v_new));
    when 'emergency_contact' then
      update public.employees
      set emergency_contact_name = coalesce(private.nullif_blank(v_values ->> 'emergency_contact_name'), emergency_contact_name),
          emergency_contact_relationship = coalesce(private.nullif_blank(v_values ->> 'emergency_contact_relationship'), emergency_contact_relationship),
          emergency_contact_mobile = coalesce(private.nullif_blank(v_values ->> 'emergency_contact_mobile'), emergency_contact_mobile)
      where id = v_emp.id;
      v_changes := jsonb_build_object(
        'emergency_contact_name', jsonb_build_object('old', v_emp.emergency_contact_name, 'new', coalesce(v_values ->> 'emergency_contact_name', v_emp.emergency_contact_name)),
        'emergency_contact_relationship', jsonb_build_object('old', v_emp.emergency_contact_relationship, 'new', coalesce(v_values ->> 'emergency_contact_relationship', v_emp.emergency_contact_relationship)),
        'emergency_contact_mobile', jsonb_build_object('old', v_emp.emergency_contact_mobile, 'new', coalesce(v_values ->> 'emergency_contact_mobile', v_emp.emergency_contact_mobile)));
    when 'passport' then
      if private.nullif_blank(v_values ->> 'passport_number') is null then
        raise exception 'hr:errors.requiredFieldMissing' using detail = 'passport_number';
      end if;
      update public.employees
      set passport_number = btrim(v_values ->> 'passport_number'),
          passport_expiry_date = coalesce((v_values ->> 'passport_expiry')::date, passport_expiry_date)
      where id = v_emp.id;
      v_changes := jsonb_build_object(
        'passport_number', jsonb_build_object('old', private.mask_tail(v_emp.passport_number), 'new', private.mask_tail(btrim(v_values ->> 'passport_number'))),
        'passport_expiry_date', jsonb_build_object('old', v_emp.passport_expiry_date, 'new', coalesce((v_values ->> 'passport_expiry')::date, v_emp.passport_expiry_date)));
    else
      return jsonb_build_object('employee', jsonb_build_object('applied', false, 'subtype', v_req.subtype));
  end case;
  return jsonb_build_object('employee', jsonb_build_object('applied', true, 'subtype', v_req.subtype, 'changes', v_changes));
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Workflow engine
-- ---------------------------------------------------------------------------------------------------
-- Steps for a request type: the active workflow's steps, or (fallback) manager (if requires_manager_approval)
-- then HR (if requires_hr_approval, or when nothing else is configured).
create or replace function private.resolve_steps(p_request_type_id uuid)
returns table (
  step_order int, step_id uuid, step_type text, approver_role_key text, approver_user_id uuid,
  can_return boolean, can_reassign boolean, name_ar text, name_en text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_type public.request_types;
  v_wf   uuid;
begin
  select * into v_type from public.request_types t where t.id = p_request_type_id;
  if not found then
    return;
  end if;
  select w.id into v_wf from public.request_workflows w where w.id = v_type.workflow_id and w.is_active;
  if v_wf is null then
    select w.id into v_wf from public.request_workflows w
    where w.request_type_id = p_request_type_id and w.is_active
    order by w.created_at desc limit 1;
  end if;
  if v_wf is not null and exists (select 1 from public.request_workflow_steps s where s.workflow_id = v_wf) then
    return query
      select s.step_order, s.id, s.step_type, s.approver_role_key, s.approver_user_id, s.can_return, s.can_reassign,
             s.name_ar, s.name_en
      from public.request_workflow_steps s
      where s.workflow_id = v_wf
      order by s.step_order;
    return;
  end if;
  if v_type.requires_manager_approval then
    return query select 1, null::uuid, 'manager'::text, null::text, null::uuid, true, true,
                        'اعتماد المدير المباشر'::text, 'Direct manager approval'::text;
  end if;
  if v_type.requires_hr_approval or not v_type.requires_manager_approval then
    return query select case when v_type.requires_manager_approval then 2 else 1 end, null::uuid, 'hr'::text,
                        null::text, null::uuid, true, true, 'مراجعة الموارد البشرية'::text, 'HR review'::text;
  end if;
end;
$$;

create or replace function private.request_params(p_request_id uuid, p_extra jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
      'request_id', r.id,
      'request_number', r.request_number,
      'request_type_key', t.key,
      'request_type_name_ar', t.name_ar,
      'request_type_name_en', t.name_en,
      'status', r.status,
      'actor_name', private.profile_display_name(auth.uid()),
      'employee_name_ar', e.name_ar,
      'employee_name_en', e.name_en,
      'employee_number', e.employee_number
    ) || coalesce(p_extra, '{}'::jsonb)
  from public.hr_requests r
  join public.request_types t on t.id = r.request_type_id
  join public.employees e on e.id = r.employee_id
  where r.id = p_request_id
$$;

create or replace function private.add_history(
  p_request_id uuid, p_action text, p_from text, p_to text, p_note text default null, p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.request_history (request_id, action, from_status, to_status, actor_id, actor_name, note, metadata)
  values (p_request_id, p_action, p_from, p_to, auth.uid(), private.profile_display_name(auth.uid()), p_note,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Final approval: status approved + built-in effects (leave balance, bank account, employee data).
create or replace function private.finalize_approval(p_request_id uuid, p_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req     public.hr_requests;
  v_type    public.request_types;
  v_effects jsonb := '{}'::jsonb;
  v_effect  jsonb;
  v_notifs  uuid[];
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  select * into v_type from public.request_types where id = v_req.request_type_id;

  v_effect := private.leave_consume(p_request_id);
  if v_effect is not null then
    v_effects := v_effects || jsonb_build_object('leave', v_effect);
  end if;
  if v_type.key = 'bank_update' then
    v_effects := v_effects || private.apply_bank_update(p_request_id);
  elsif v_type.key = 'employee_info_update' then
    v_effects := v_effects || private.apply_employee_info_update(p_request_id);
  end if;

  update public.hr_requests
  set status = 'approved', current_step_id = null, current_step_order = null, current_step_type = null,
      current_approver_id = null
  where id = p_request_id;

  if p_history_id is not null and v_effects <> '{}'::jsonb then
    update public.request_history set metadata = metadata || jsonb_build_object('effects', v_effects) where id = p_history_id;
  end if;

  v_notifs := private.notify_many(
    array[v_req.requester_id, private.employee_profile_id(v_req.employee_id)],
    'request_approved', private.request_params(p_request_id), '/requests/' || p_request_id, 'hr_request', p_request_id
  );
  return jsonb_build_object('status', 'approved', 'notification_ids', to_jsonb(coalesce(v_notifs, '{}')));
end;
$$;

-- Moves the request to the next actionable step (p_inclusive: start AT p_from_order, else AFTER it).
-- Manager/user/role steps without a usable approver are skipped with a history note. When no step is
-- left the request is finally approved.
create or replace function private.enter_steps(p_request_id uuid, p_from_order int, p_inclusive boolean, p_history_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req       public.hr_requests;
  v_step      record;
  v_approver  uuid;
  v_queue     uuid[];
  v_reason    text;
  v_status    text;
  v_scope     text;
  v_mgr_emp   uuid;
  v_emp_prof  uuid;
  v_notifs    uuid[] := '{}';
  v_link      text := '/requests/' || p_request_id;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  v_emp_prof := private.employee_profile_id(v_req.employee_id);

  for v_step in
    select * from private.resolve_steps(v_req.request_type_id) rs
    where (p_inclusive and rs.step_order >= p_from_order) or (not p_inclusive and rs.step_order > p_from_order)
    order by rs.step_order
  loop
    v_approver := null;
    v_queue := null;
    v_reason := null;

    if v_step.step_type = 'manager' then
      select e.manager_id into v_mgr_emp from public.employees e where e.id = v_req.employee_id;
      v_approver := private.employee_profile_id(v_mgr_emp);
      if v_mgr_emp is null then
        v_reason := 'no_manager';
      elsif v_approver is null then
        v_reason := 'manager_without_active_account';
      elsif v_approver = v_req.requester_id then
        v_reason := 'approver_is_requester';
      end if;
    elsif v_step.step_type = 'user' then
      v_approver := case when private.user_is_active(v_step.approver_user_id) then v_step.approver_user_id end;
      if v_approver is null then
        v_reason := 'approver_inactive';
      elsif v_approver = v_req.requester_id or v_approver = v_emp_prof then
        v_reason := 'approver_is_requester';
      end if;
    elsif v_step.step_type = 'role' then
      v_queue := array(
        select u from private.users_with_role(v_step.approver_role_key) as u
        where u is distinct from v_req.requester_id and u is distinct from v_emp_prof
      );
      if cardinality(v_queue) = 0 then
        v_reason := 'no_role_members';
      end if;
    end if;

    if v_reason is not null then
      insert into public.request_approvals (request_id, step_id, step_order, step_type, decision, comment, decided_at)
      values (p_request_id, v_step.step_id, v_step.step_order, v_step.step_type, 'skipped', v_reason, now());
      insert into public.request_history (request_id, action, from_status, to_status, actor_id, actor_name, note, metadata)
      values (p_request_id, 'skip', v_req.status, v_req.status, null, null, null,
              jsonb_build_object('step_order', v_step.step_order, 'step_type', v_step.step_type,
                                 'step_name_ar', v_step.name_ar, 'step_name_en', v_step.name_en, 'reason', v_reason));
      continue;
    end if;

    if v_step.step_type = 'manager' then
      v_status := 'pending_manager_approval';
    elsif v_step.step_type = 'user' then
      v_status := case when private.user_is_hr(v_approver) then 'pending_hr_review' else 'pending_manager_approval' end;
    elsif v_step.step_type = 'role' then
      select r.data_scope into v_scope from public.roles r where r.key = v_step.approver_role_key;
      v_status := case when v_scope = 'organization' then 'pending_hr_review' else 'pending_manager_approval' end;
    else
      v_status := 'pending_hr_review';
    end if;

    update public.hr_requests
    set status = v_status,
        current_step_id = v_step.step_id,
        current_step_order = v_step.step_order,
        current_step_type = v_step.step_type,
        current_approver_id = case when v_step.step_type in ('manager', 'user') then v_approver end
    where id = p_request_id;

    insert into public.request_approvals (request_id, step_id, step_order, step_type, approver_id, approver_name, decision)
    values (
      p_request_id, v_step.step_id, v_step.step_order, v_step.step_type,
      case when v_step.step_type in ('manager', 'user') then v_approver
           when v_step.step_type = 'hr' then v_req.assigned_to end,
      case when v_step.step_type in ('manager', 'user') then private.profile_display_name(v_approver)
           when v_step.step_type = 'hr' and v_req.assigned_to is not null then private.profile_display_name(v_req.assigned_to) end,
      'pending'
    );

    if v_step.step_type in ('manager', 'user') then
      v_queue := array[v_approver];
    elsif v_step.step_type = 'hr' then
      if v_req.assigned_to is not null and private.user_is_active(v_req.assigned_to) then
        v_queue := array[v_req.assigned_to];
      else
        v_queue := array(
          select u from private.users_with_org_permission('requests', 'approve') as u
          where u is distinct from v_req.requester_id and u is distinct from v_emp_prof
        );
      end if;
    end if;
    v_notifs := v_notifs || coalesce(private.notify_many(
      v_queue, 'approval_required',
      private.request_params(p_request_id, jsonb_build_object('step_name_ar', v_step.name_ar, 'step_name_en', v_step.name_en)),
      v_link, 'hr_request', p_request_id), '{}');

    return jsonb_build_object('status', v_status, 'notification_ids', to_jsonb(v_notifs));
  end loop;

  return private.finalize_approval(p_request_id, p_history_id);
end;
$$;

-- Can the caller act (approve/reject/return/reassign) on the request's current step?
create or replace function private.can_act_on_current_step(p_request_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_req public.hr_requests;
begin
  if not private.is_active_user() then
    return false;
  end if;
  select * into v_req from public.hr_requests where id = p_request_id;
  if not found or v_req.status not in ('pending_manager_approval', 'pending_hr_review') then
    return false;
  end if;
  -- segregation of duties: nobody approves their own request (super_admin excepted for single-admin orgs)
  if (v_req.requester_id = auth.uid() or v_req.employee_id = private.current_employee_id())
     and not private.is_super_admin() then
    return false;
  end if;
  return case v_req.current_step_type
    when 'manager' then v_req.current_approver_id = auth.uid()
    when 'user' then v_req.current_approver_id = auth.uid()
    when 'hr' then private.has_org_permission('requests', 'approve') or private.has_org_permission('approvals', 'approve')
    when 'role' then private.can_act_on_role_step(v_req.current_step_id)
    else false
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Public request RPCs
-- ---------------------------------------------------------------------------------------------------
create or replace function public.create_request_draft(
  p_request_type_id uuid,
  p_values jsonb,
  p_subtype text default null,
  p_employee_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type  public.request_types;
  v_me    uuid := private.current_employee_id();
  v_emp   uuid;
  v_id    uuid;
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_type from public.request_types where id = p_request_type_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'request_type';
  end if;
  if not v_type.is_active then
    raise exception 'hr:errors.requestTypeInactive';
  end if;

  v_emp := coalesce(p_employee_id, v_me);
  if v_emp is null then
    raise exception 'hr:errors.employeeNotLinked';
  end if;
  if v_emp is distinct from v_me then
    -- on behalf of another employee: HR only
    if not private.has_org_permission('requests', 'create') then
      raise exception 'hr:errors.forbidden' using errcode = '42501';
    end if;
    if not exists (select 1 from public.employees e where e.id = v_emp and e.archived_at is null) then
      raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
    end if;
  elsif not (private.has_permission('requests', 'create')
             or (private.is_leave_request_type(v_type.id) and private.has_permission('leave', 'create'))) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;

  perform private.validate_subtype(v_type.id, private.nullif_blank(p_subtype));

  insert into public.hr_requests (request_type_id, subtype, employee_id, requester_id, status)
  values (v_type.id, private.nullif_blank(p_subtype), v_emp, auth.uid(), 'draft')
  returning id into v_id;

  perform private.save_request_values(v_id, p_values, true);
  update public.hr_requests set title = private.compute_request_title(v_id) where id = v_id;

  perform private.add_history(v_id, 'create', null, 'draft');
  perform private.write_audit('request.create', 'hr_request', v_id::text, v_type.key, null, v_emp);
  return v_id;
end;
$$;

create or replace function public.update_request_draft(p_request_id uuid, p_values jsonb, p_subtype text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.hr_requests;
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_req from public.hr_requests where id = p_request_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_req.requester_id is distinct from auth.uid() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if v_req.status not in ('draft', 'returned') then
    raise exception 'hr:errors.requestNotEditable';
  end if;

  perform private.validate_subtype(v_req.request_type_id, private.nullif_blank(p_subtype));
  update public.hr_requests set subtype = private.nullif_blank(p_subtype) where id = p_request_id;
  perform private.save_request_values(p_request_id, p_values, true);
  update public.hr_requests set title = private.compute_request_title(p_request_id) where id = p_request_id;

  if v_req.status = 'returned' then
    perform private.add_history(p_request_id, 'update', v_req.status, v_req.status);
  end if;
  perform private.write_audit('request.update', 'hr_request', p_request_id::text,
                              coalesce(v_req.request_number, 'draft'), null, v_req.employee_id);
end;
$$;

create or replace function public.submit_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req       public.hr_requests;
  v_type      public.request_types;
  v_resubmit  boolean;
  v_hist      uuid;
  v_result    jsonb;
  v_from      int;
  v_notifs    uuid[];
  v_submitted uuid;
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_req from public.hr_requests where id = p_request_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_req.requester_id is distinct from auth.uid() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if v_req.status not in ('draft', 'returned') then
    raise exception 'hr:errors.requestNotEditable';
  end if;
  select * into v_type from public.request_types where id = v_req.request_type_id;
  v_resubmit := v_req.status = 'returned';
  if not v_resubmit and not v_type.is_active then
    raise exception 'hr:errors.requestTypeInactive';
  end if;

  perform private.validate_request_for_submit(p_request_id);
  if private.is_leave_request_type(v_req.request_type_id) then
    perform private.prepare_leave_on_submit(p_request_id);
  end if;

  update public.hr_requests
  set request_number = coalesce(request_number, private.next_document_number('HR')),
      submitted_at = coalesce(submitted_at, now()),
      due_at = private.sla_due_at(now(), v_type.sla_business_days),
      status = 'submitted',
      title = private.compute_request_title(p_request_id),
      current_approver_id = null
  where id = p_request_id;

  v_hist := private.add_history(p_request_id, case when v_resubmit then 'resubmit' else 'submit' end, v_req.status, 'submitted',
                                null, case when v_resubmit then jsonb_build_object('resume_step_order', v_req.returned_from_step_order) else '{}'::jsonb end);

  v_from := case when v_resubmit then coalesce(v_req.returned_from_step_order, 0) else 0 end;
  v_result := private.enter_steps(p_request_id, v_from, true, v_hist);

  update public.request_history set to_status = v_result ->> 'status' where id = v_hist;
  update public.hr_requests set returned_from_step_order = null where id = p_request_id;

  -- confirmation to the requester (and the employee when HR filed on their behalf)
  v_submitted := private.notify(v_req.requester_id, 'request_submitted', private.request_params(p_request_id),
                                '/requests/' || p_request_id, 'hr_request', p_request_id, true);
  v_notifs := array(select jsonb_array_elements_text(v_result -> 'notification_ids')::uuid);
  if v_submitted is not null then
    v_notifs := v_submitted || v_notifs;
  end if;
  if private.employee_profile_id(v_req.employee_id) is distinct from v_req.requester_id then
    v_notifs := v_notifs || coalesce(private.notify_many(array[private.employee_profile_id(v_req.employee_id)], 'request_submitted',
                                     private.request_params(p_request_id), '/requests/' || p_request_id, 'hr_request', p_request_id), '{}');
  end if;

  perform private.write_audit(case when v_resubmit then 'request.resubmit' else 'request.submit' end, 'hr_request',
                              p_request_id::text, (select request_number from public.hr_requests where id = p_request_id),
                              jsonb_build_object('status', jsonb_build_object('old', v_req.status, 'new', v_result ->> 'status')),
                              v_req.employee_id);

  return jsonb_build_object('status', v_result ->> 'status', 'notification_ids', to_jsonb(v_notifs));
end;
$$;

create or replace function public.act_on_request(
  p_request_id uuid,
  p_action text,
  p_comment text default null,
  p_target_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req       public.hr_requests;
  v_step      record;
  v_hist      uuid;
  v_result    jsonb;
  v_notifs    uuid[] := '{}';
  v_effect    jsonb;
  v_is_owner  boolean;
  v_is_hr     boolean;
  v_comment   text := private.nullif_blank(p_comment);
  v_link      text := '/requests/' || p_request_id;
  v_owner_ids uuid[];
  v_status    text;
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve', 'reject', 'return', 'reassign', 'start', 'complete', 'cancel') then
    raise exception 'hr:errors.validation' using detail = 'action';
  end if;
  select * into v_req from public.hr_requests where id = p_request_id for update;
  if not found or not private.can_view_request(p_request_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;

  v_owner_ids := array[v_req.requester_id, private.employee_profile_id(v_req.employee_id)];
  v_is_owner := v_req.requester_id = auth.uid() or v_req.employee_id = private.current_employee_id();
  select * into v_step from private.resolve_steps(v_req.request_type_id) rs where rs.step_order = v_req.current_step_order;

  -- ---------------------------------------------------------------- step decisions
  if p_action in ('approve', 'reject', 'return') then
    if v_req.status not in ('pending_manager_approval', 'pending_hr_review') then
      raise exception 'hr:errors.invalidTransition';
    end if;
    if not private.can_act_on_current_step(p_request_id) then
      raise exception 'hr:errors.forbidden' using errcode = '42501';
    end if;
    if p_action in ('reject', 'return') and v_comment is null then
      raise exception 'hr:errors.commentRequired';
    end if;
    if p_action = 'return' and v_step.can_return is false then
      raise exception 'hr:errors.returnNotAllowed';
    end if;

    update public.request_approvals
    set decision = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end,
        approver_id = auth.uid(), approver_name = private.profile_display_name(auth.uid()),
        comment = v_comment, decided_at = now()
    where request_id = p_request_id and decision = 'pending';
    if not found then
      insert into public.request_approvals (request_id, step_id, step_order, step_type, approver_id, approver_name, decision, comment, decided_at)
      values (p_request_id, v_req.current_step_id, coalesce(v_req.current_step_order, 1), coalesce(v_req.current_step_type, 'hr'),
              auth.uid(), private.profile_display_name(auth.uid()),
              case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'returned' end, v_comment, now());
    end if;

    if p_action = 'approve' then
      v_hist := private.add_history(p_request_id, 'approve', v_req.status, v_req.status, v_comment,
                                    jsonb_build_object('step_order', v_req.current_step_order, 'step_type', v_req.current_step_type,
                                                       'step_name_ar', v_step.name_ar, 'step_name_en', v_step.name_en));
      v_result := private.enter_steps(p_request_id, v_req.current_step_order, false, v_hist);
      update public.request_history set to_status = v_result ->> 'status' where id = v_hist;
      v_notifs := array(select jsonb_array_elements_text(v_result -> 'notification_ids')::uuid);
      v_status := v_result ->> 'status';
    elsif p_action = 'reject' then
      v_effect := private.leave_release(p_request_id, 'reject');
      update public.hr_requests
      set status = 'rejected', current_approver_id = null, current_step_id = null, current_step_type = null
      where id = p_request_id;
      v_hist := private.add_history(p_request_id, 'reject', v_req.status, 'rejected', v_comment,
                                    jsonb_build_object('step_order', v_req.current_step_order, 'step_type', v_req.current_step_type)
                                    || case when v_effect is not null then jsonb_build_object('effects', jsonb_build_object('leave', v_effect)) else '{}'::jsonb end);
      v_status := 'rejected';
      v_notifs := coalesce(private.notify_many(v_owner_ids, 'request_rejected',
                    private.request_params(p_request_id, jsonb_build_object('comment', v_comment)), v_link, 'hr_request', p_request_id), '{}');
    else -- return
      v_effect := private.leave_release(p_request_id, 'return');
      update public.hr_requests
      set status = 'returned', returned_from_step_order = v_req.current_step_order,
          current_approver_id = null, current_step_id = null, current_step_type = null, current_step_order = null
      where id = p_request_id;
      v_hist := private.add_history(p_request_id, 'return', v_req.status, 'returned', v_comment,
                                    jsonb_build_object('step_order', v_req.current_step_order, 'step_type', v_req.current_step_type)
                                    || case when v_effect is not null then jsonb_build_object('effects', jsonb_build_object('leave', v_effect)) else '{}'::jsonb end);
      v_status := 'returned';
      v_notifs := coalesce(private.notify_many(v_owner_ids, 'request_returned',
                    private.request_params(p_request_id, jsonb_build_object('comment', v_comment)), v_link, 'hr_request', p_request_id), '{}');
    end if;

  -- ---------------------------------------------------------------- reassign
  elsif p_action = 'reassign' then
    if p_target_user is null or not private.user_is_active(p_target_user) then
      raise exception 'hr:errors.invalidAssignee';
    end if;
    if p_target_user = v_req.requester_id or p_target_user = private.employee_profile_id(v_req.employee_id) then
      raise exception 'hr:errors.invalidAssignee';
    end if;
    if v_req.status in ('approved', 'in_progress') then
      -- fulfilment owner (HR)
      if not private.has_org_permission('requests', 'edit') then
        raise exception 'hr:errors.forbidden' using errcode = '42501';
      end if;
      if not private.user_has_permission(p_target_user, 'requests', 'edit', true) then
        raise exception 'hr:errors.invalidAssignee';
      end if;
      update public.hr_requests set assigned_to = p_target_user where id = p_request_id;
      v_status := v_req.status;
    elsif v_req.status in ('pending_manager_approval', 'pending_hr_review') then
      if v_step.can_reassign is false then
        raise exception 'hr:errors.reassignNotAllowed';
      end if;
      if not (private.can_act_on_current_step(p_request_id) or private.has_org_permission('requests', 'edit')) then
        raise exception 'hr:errors.forbidden' using errcode = '42501';
      end if;
      if v_req.current_step_type = 'hr' then
        if not (private.user_has_permission(p_target_user, 'requests', 'approve', true)
                or private.user_has_permission(p_target_user, 'approvals', 'approve', true)) then
          raise exception 'hr:errors.invalidAssignee';
        end if;
        update public.hr_requests set assigned_to = p_target_user where id = p_request_id;
      elsif v_req.current_step_type in ('manager', 'user') then
        update public.hr_requests set current_approver_id = p_target_user where id = p_request_id;
      else
        raise exception 'hr:errors.reassignNotAllowed';
      end if;
      update public.request_approvals
      set decision = 'reassigned', approver_id = coalesce(approver_id, auth.uid()),
          approver_name = coalesce(approver_name, private.profile_display_name(auth.uid())),
          comment = v_comment, decided_at = now()
      where request_id = p_request_id and decision = 'pending';
      insert into public.request_approvals (request_id, step_id, step_order, step_type, approver_id, approver_name, decision)
      values (p_request_id, v_req.current_step_id, coalesce(v_req.current_step_order, 1), coalesce(v_req.current_step_type, 'hr'),
              p_target_user, private.profile_display_name(p_target_user), 'pending');
      v_status := v_req.status;
    else
      raise exception 'hr:errors.invalidTransition';
    end if;
    v_hist := private.add_history(p_request_id, 'reassign', v_req.status, v_status, v_comment,
                                  jsonb_build_object('target_user_id', p_target_user,
                                                     'target_name', private.profile_display_name(p_target_user)));
    v_notifs := coalesce(private.notify_many(array[p_target_user], 'request_assigned',
                  private.request_params(p_request_id), v_link, 'hr_request', p_request_id), '{}');

  -- ---------------------------------------------------------------- fulfilment
  elsif p_action in ('start', 'complete') then
    if not (private.has_org_permission('requests', 'edit') or private.has_org_permission('requests', 'approve')) then
      raise exception 'hr:errors.forbidden' using errcode = '42501';
    end if;
    if p_action = 'start' then
      if v_req.status <> 'approved' then
        raise exception 'hr:errors.invalidTransition';
      end if;
      update public.hr_requests set status = 'in_progress', assigned_to = coalesce(assigned_to, auth.uid()) where id = p_request_id;
      v_status := 'in_progress';
      v_notifs := coalesce(private.notify_many(v_owner_ids, 'request_in_progress', private.request_params(p_request_id),
                    v_link, 'hr_request', p_request_id), '{}');
    else
      if v_req.status not in ('approved', 'in_progress') then
        raise exception 'hr:errors.invalidTransition';
      end if;
      update public.hr_requests set status = 'completed', completed_at = now(), assigned_to = coalesce(assigned_to, auth.uid())
      where id = p_request_id;
      v_status := 'completed';
      v_notifs := coalesce(private.notify_many(v_owner_ids, 'request_completed',
                    private.request_params(p_request_id, jsonb_build_object('comment', v_comment)), v_link, 'hr_request', p_request_id), '{}');
    end if;
    v_hist := private.add_history(p_request_id, p_action, v_req.status, v_status, v_comment);

  -- ---------------------------------------------------------------- cancel
  else
    v_is_hr := private.has_org_permission('requests', 'edit');
    if v_req.status in ('rejected', 'completed', 'cancelled') then
      raise exception 'hr:errors.invalidTransition';
    end if;
    if not ((v_is_owner and v_req.status in ('draft', 'submitted', 'pending_manager_approval', 'pending_hr_review', 'returned'))
            or v_is_hr) then
      if v_is_owner then
        raise exception 'hr:errors.invalidTransition';
      end if;
      raise exception 'hr:errors.forbidden' using errcode = '42501';
    end if;
    v_effect := private.leave_release(p_request_id, 'cancel');
    update public.request_approvals set decision = 'skipped', comment = coalesce(comment, 'cancelled'), decided_at = now()
    where request_id = p_request_id and decision = 'pending';
    update public.hr_requests
    set status = 'cancelled', cancelled_at = now(), current_approver_id = null, current_step_id = null,
        current_step_type = null
    where id = p_request_id;
    v_status := 'cancelled';
    v_hist := private.add_history(p_request_id, 'cancel', v_req.status, 'cancelled', v_comment,
                                  case when v_effect is not null then jsonb_build_object('effects', jsonb_build_object('leave', v_effect)) else '{}'::jsonb end);
    if v_req.status <> 'draft' then
      if v_is_owner then
        v_notifs := coalesce(private.notify_many(array[v_req.current_approver_id, v_req.assigned_to], 'request_cancelled',
                      private.request_params(p_request_id), v_link, 'hr_request', p_request_id), '{}');
      else
        v_notifs := coalesce(private.notify_many(v_owner_ids, 'request_cancelled',
                      private.request_params(p_request_id, jsonb_build_object('comment', v_comment)), v_link, 'hr_request', p_request_id), '{}');
      end if;
    end if;
  end if;

  perform private.write_audit('request.' || p_action, 'hr_request', p_request_id::text,
                              coalesce(v_req.request_number, 'draft'),
                              jsonb_build_object('status', jsonb_build_object('old', v_req.status, 'new', v_status))
                              || case when p_target_user is not null then jsonb_build_object('target_user_id', p_target_user) else '{}'::jsonb end,
                              v_req.employee_id);

  return jsonb_build_object('status', v_status, 'notification_ids', to_jsonb(coalesce(v_notifs, '{}')));
end;
$$;

create or replace function public.add_request_comment(p_request_id uuid, p_body text, p_is_internal boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.hr_requests;
  v_body  text := private.nullif_blank(p_body);
  v_id    uuid;
  v_to    uuid[];
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_req from public.hr_requests where id = p_request_id;
  if not found or not private.can_view_request(p_request_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_body is null or length(v_body) > 5000 then
    raise exception 'hr:errors.validation' using detail = 'body';
  end if;
  if coalesce(p_is_internal, false) and not private.has_org_permission('requests', 'view') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;

  insert into public.request_comments (request_id, author_id, author_name, body, is_internal)
  values (p_request_id, auth.uid(), private.profile_display_name(auth.uid()), v_body, coalesce(p_is_internal, false))
  returning id into v_id;

  if coalesce(p_is_internal, false) then
    v_to := array[v_req.assigned_to];
  else
    perform private.add_history(p_request_id, 'comment', v_req.status, v_req.status, null, jsonb_build_object('comment_id', v_id));
    v_to := array[v_req.requester_id, private.employee_profile_id(v_req.employee_id), v_req.current_approver_id, v_req.assigned_to];
  end if;
  if v_req.status <> 'draft' then
    perform private.notify_many(v_to, 'request_comment',
                                private.request_params(p_request_id, jsonb_build_object('is_internal', coalesce(p_is_internal, false))),
                                '/requests/' || p_request_id, 'hr_request', p_request_id);
  end if;
  return v_id;
end;
$$;

-- Workflow progress for the request details side panel (resolved steps incl. the synthesized fallback).
create or replace function public.get_request_workflow(p_request_id uuid)
returns table (
  step_order int, step_type text, name_ar text, name_en text, state text, approver_id uuid, approver_name text,
  decided_at timestamptz, comment text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.hr_requests;
begin
  select * into v_req from public.hr_requests where id = p_request_id;
  if not found or not private.can_view_request(p_request_id) then
    return;
  end if;
  return query
    select s.step_order, s.step_type, s.name_ar, s.name_en,
           case
             when v_req.status in ('pending_manager_approval', 'pending_hr_review') and s.step_order = v_req.current_step_order then 'current'
             when v_req.status = 'returned' and s.step_order = v_req.returned_from_step_order then 'returned'
             when a.decision = 'approved' then 'approved'
             when a.decision = 'rejected' then 'rejected'
             when a.decision = 'skipped' then 'skipped'
             when a.decision = 'returned' then 'returned'
             else 'upcoming'
           end,
           a.approver_id, a.approver_name, a.decided_at,
           case when a.decision = 'skipped' then a.comment else null end
    from private.resolve_steps(v_req.request_type_id) s
    left join lateral (
      select ra.* from public.request_approvals ra
      where ra.request_id = p_request_id and ra.step_order = s.step_order and ra.decision <> 'reassigned'
      order by ra.created_at desc limit 1
    ) a on true
    order by s.step_order;
end;
$$;
