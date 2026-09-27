-- =====================================================================================================
-- HR Portal — authorization & domain helpers (schema private; ARCHITECTURE.md §7)
-- All helpers: security definer, stable, search_path = ''. Every helper returns false/NULL for callers
-- whose profile status is not 'active'.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Per-user primitives (parameterised by user id; used by the no-arg helpers and the workflow engine)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.user_is_active(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.status = 'active' from public.profiles p where p.id = p_user_id), false)
$$;

create or replace function private.user_has_role(p_user_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_active(p_user_id) and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.key = p_role_key
  )
$$;

-- p_org_scope = true → only permissions granted through roles with data_scope = 'organization' count.
create or replace function private.user_has_permission(p_user_id uuid, p_module text, p_action text, p_org_scope boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_active(p_user_id) and (
    private.user_has_role(p_user_id, 'super_admin')
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      where ur.user_id = p_user_id
        and rp.module = p_module
        and rp.action = p_action
        and (not p_org_scope or r.data_scope = 'organization')
    )
  )
$$;

create or replace function private.user_is_hr(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_active(p_user_id) and exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.data_scope = 'organization'
  )
$$;

-- ---------------------------------------------------------------------------------------------------
-- Current-user helpers (the contract in ARCHITECTURE.md §7)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.current_profile_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.status from public.profiles p where p.id = auth.uid()
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_active(auth.uid())
$$;

create or replace function private.has_role(p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_role(auth.uid(), p_role_key)
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_role(auth.uid(), 'super_admin')
$$;

-- Active user holding an organization-scoped role (super_admin / hr_admin / hr_officer or a custom HR role).
create or replace function private.is_hr()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_is_hr(auth.uid())
$$;

-- Module permission through ANY role (UI gating, RPC action checks). super_admin ⇒ true.
create or replace function private.has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_permission(auth.uid(), p_module, p_action, false)
$$;

-- Organization-wide permission (only through roles with data_scope = 'organization'). Used by RLS for
-- "see/modify every row" access. super_admin ⇒ true.
create or replace function private.has_org_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_permission(auth.uid(), p_module, p_action, true)
$$;

create or replace function private.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.employee_id from public.profiles p where p.id = auth.uid() and p.status = 'active'
$$;

-- Direct report check (structural: employees.manager_id).
create or replace function private.is_manager_of(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    where e.id = p_employee_id
      and e.manager_id is not null
      and e.manager_id = private.current_employee_id()
  )
$$;

create or replace function private.can_view_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_employee_id is not null and (
    p_employee_id = private.current_employee_id()
    or private.is_manager_of(p_employee_id)
    or private.has_org_permission('employees', 'view')
  )
$$;

-- Active profile linked to an employee (NULL if none).
create or replace function private.employee_profile_id(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p where p.employee_id = p_employee_id and p.status = 'active' limit 1
$$;

-- Users (active) with an organization-scoped permission — HR queues.
create or replace function private.users_with_org_permission(p_module text, p_action text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.status = 'active' and private.user_has_permission(p.id, p_module, p_action, true)
$$;

create or replace function private.users_with_role(p_role_key text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ur.user_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id
  where r.key = p_role_key and p.status = 'active'
$$;

-- Display name for a profile: full_name → linked employee name → email.
create or replace function private.profile_display_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(p.full_name), ''),
    nullif(btrim(e.name_ar), ''),
    nullif(btrim(e.name_en), ''),
    p.email
  )
  from public.profiles p
  left join public.employees e on e.id = p.employee_id
  where p.id = p_profile_id
$$;

create or replace function private.actor_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.email from public.profiles p where p.id = auth.uid()),
    (select u.email::text from auth.users u where u.id = auth.uid())
  )
$$;

-- Request metadata (PostgREST exposes request headers as a GUC).
create or replace function private.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(btrim(split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
    nullif(current_setting('request.headers', true), '')::json ->> 'x-real-ip',
    ''), ',', 1)), '')
$$;

create or replace function private.request_user_agent()
returns text
language sql
stable
set search_path = ''
as $$
  select left(nullif(current_setting('request.headers', true), '')::json ->> 'user-agent', 500)
$$;

-- ---------------------------------------------------------------------------------------------------
-- Organization calendar (timezone, working days, public holidays)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.org_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.timezone from public.organization_settings s limit 1), 'Asia/Riyadh')
$$;

create or replace function private.org_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone private.org_timezone())::date
$$;

-- Business day = organization working day, not a weekend day, not inside an active public holiday.
create or replace function private.is_business_day(p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
      (select extract(dow from p_date)::int = any (s.working_days)
              and not (extract(dow from p_date)::int = any (s.weekend_days))
         from public.organization_settings s limit 1),
      extract(dow from p_date)::int between 0 and 4)
    and not exists (
      select 1 from public.public_holidays h
      where h.is_active and p_date between h.start_date and h.end_date
    )
$$;

-- p_days business days after p_start (p_days = 0 → p_start itself, or the next business day if p_start
-- is not one). Submitted on Thursday + 2 → Monday (Sun–Thu week).
create or replace function private.add_business_days(p_start date, p_days int)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_date  date := p_start;
  v_count int := 0;
  v_guard int := 0;
begin
  if p_start is null or p_days is null then
    return null;
  end if;
  if p_days <= 0 then
    while not private.is_business_day(v_date) and v_guard < 3660 loop
      v_date := v_date + 1;
      v_guard := v_guard + 1;
    end loop;
    return v_date;
  end if;
  while v_count < p_days and v_guard < 3660 loop
    v_date := v_date + 1;
    v_guard := v_guard + 1;
    if private.is_business_day(v_date) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_date;
end;
$$;

-- SLA deadline: end of the working day (organization_settings.work_end, org timezone) that is
-- p_days business days after p_from.
create or replace function private.sla_due_at(p_from timestamptz, p_days int)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_days is null or p_from is null then null else
    (private.add_business_days((p_from at time zone private.org_timezone())::date, p_days)
      + coalesce((select s.work_end from public.organization_settings s limit 1), time '23:59:59'))
    at time zone private.org_timezone()
  end
$$;

-- ---------------------------------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------------------------------
-- Creates one in-app notification (honours notification_settings; never notifies the acting user unless
-- p_include_actor). Returns the id or NULL when nothing was created.
create or replace function private.notify(
  p_user_id uuid,
  p_type text,
  p_params jsonb,
  p_link text,
  p_entity_type text,
  p_entity_id uuid,
  p_include_actor boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_in_app  boolean;
  v_email   boolean;
begin
  if p_user_id is null then
    return null;
  end if;
  if not p_include_actor and p_user_id = auth.uid() then
    return null;
  end if;
  -- only active users receive notifications, except registration outcomes (sent to the applicant)
  if p_type not like 'registration\_%' and not private.user_is_active(p_user_id) then
    return null;
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    return null;
  end if;
  select ns.in_app_enabled, ns.email_enabled into v_in_app, v_email
  from public.notification_settings ns where ns.event_key = p_type;
  if found and not (v_in_app or v_email) then
    return null;
  end if;
  insert into public.notifications (user_id, type, params, link, entity_type, entity_id, read_at)
  values (
    p_user_id, p_type, coalesce(p_params, '{}'::jsonb), p_link, p_entity_type, p_entity_id,
    -- email-only events are stored already read so they do not show up as unread in-app items
    case when found and not v_in_app then now() end
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.notify_many(
  p_user_ids uuid[],
  p_type text,
  p_params jsonb,
  p_link text,
  p_entity_type text,
  p_entity_id uuid
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids  uuid[] := '{}';
  v_uid  uuid;
  v_id   uuid;
begin
  for v_uid in select distinct u from unnest(coalesce(p_user_ids, '{}')) as u where u is not null loop
    v_id := private.notify(v_uid, p_type, p_params, p_link, p_entity_type, p_entity_id);
    if v_id is not null then
      v_ids := v_ids || v_id;
    end if;
  end loop;
  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Audit writer (used by triggers and RPCs)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.mask_changes(p_changes jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_changes is null or jsonb_typeof(p_changes) <> 'object' then p_changes
    else coalesce((
      select jsonb_object_agg(
        k,
        case
          when k = any (array['iban', 'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance',
                              'total_salary', 'national_id', 'passport_number', 'salary', 'amount_salary'])
            then case
              when jsonb_typeof(v) = 'object' then (
                select jsonb_object_agg(k2, case when v2 = 'null'::jsonb then v2 else '"***"'::jsonb end)
                from jsonb_each(v) as e2(k2, v2))
              when v = 'null'::jsonb then v
              else '"***"'::jsonb
            end
          else v
        end)
      from jsonb_each(p_changes) as e(k, v)
    ), '{}'::jsonb)
  end
$$;

create or replace function private.write_audit(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text,
  p_changes jsonb default null,
  p_employee_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('hr.suppress_audit', true), '') = 'on' then
    return;
  end if;
  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, employee_id, summary, changes, ip, user_agent)
  values (
    auth.uid(), private.actor_email(), p_action, p_entity_type, p_entity_id, p_employee_id,
    left(p_summary, 500), private.mask_changes(p_changes), private.request_ip(), private.request_user_agent()
  );
end;
$$;
