-- =====================================================================================================
-- HR Portal — administration, registration, leave balance, notification e-mail, search, public and
-- dashboard RPCs
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Registration review
-- ---------------------------------------------------------------------------------------------------
create or replace function public.approve_registration(p_profile_id uuid, p_employee_id uuid default null, p_role_key text default 'employee')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_role    public.roles;
begin
  if not (private.has_org_permission('users', 'approve') or private.has_org_permission('users', 'edit')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_profile.status not in ('pending', 'info_requested', 'rejected')
     and not (v_profile.status = 'active' and v_profile.employee_id is null) then
    raise exception 'hr:errors.invalidTransition';
  end if;
  select * into v_role from public.roles where key = coalesce(nullif(btrim(p_role_key), ''), 'employee');
  if not found then
    raise exception 'hr:errors.roleNotFound';
  end if;
  if v_role.key = 'super_admin' and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_employee_id is not null then
    if not exists (select 1 from public.employees e where e.id = p_employee_id and e.archived_at is null) then
      raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
    end if;
    if exists (select 1 from public.profiles p where p.employee_id = p_employee_id and p.id <> p_profile_id) then
      raise exception 'hr:errors.employeeAlreadyLinked';
    end if;
  end if;

  update public.profiles
  set status = 'active', employee_id = coalesce(p_employee_id, employee_id), reviewed_by = auth.uid(),
      reviewed_at = now(), review_note = null
  where id = p_profile_id;
  insert into public.user_roles (user_id, role_id) values (p_profile_id, v_role.id) on conflict do nothing;

  perform private.write_audit('registration.approve', 'profile', p_profile_id::text, v_profile.email,
                              jsonb_build_object('employee_id', p_employee_id, 'role', v_role.key), p_employee_id);
  perform private.notify(p_profile_id, 'registration_approved',
                         jsonb_build_object('full_name', v_profile.full_name, 'actor_name', private.profile_display_name(auth.uid())),
                         '/dashboard', 'profile', p_profile_id);
end;
$$;

create or replace function public.reject_registration(p_profile_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not (private.has_org_permission('users', 'approve') or private.has_org_permission('users', 'edit')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_profile.status not in ('pending', 'info_requested') then
    raise exception 'hr:errors.invalidTransition';
  end if;
  if private.nullif_blank(p_reason) is null then
    raise exception 'hr:errors.reasonRequired';
  end if;
  update public.profiles
  set status = 'rejected', review_note = btrim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_profile_id;
  perform private.write_audit('registration.reject', 'profile', p_profile_id::text, v_profile.email,
                              jsonb_build_object('reason', btrim(p_reason)));
  perform private.notify(p_profile_id, 'registration_rejected',
                         jsonb_build_object('full_name', v_profile.full_name, 'reason', btrim(p_reason)),
                         '/pending-approval', 'profile', p_profile_id);
end;
$$;

create or replace function public.request_registration_info(p_profile_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not (private.has_org_permission('users', 'approve') or private.has_org_permission('users', 'edit')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_profile.status not in ('pending', 'info_requested') then
    raise exception 'hr:errors.invalidTransition';
  end if;
  if private.nullif_blank(p_note) is null then
    raise exception 'hr:errors.reasonRequired';
  end if;
  update public.profiles
  set status = 'info_requested', review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_profile_id;
  perform private.write_audit('registration.request_info', 'profile', p_profile_id::text, v_profile.email,
                              jsonb_build_object('note', btrim(p_note)));
  perform private.notify(p_profile_id, 'registration_info_requested',
                         jsonb_build_object('full_name', v_profile.full_name, 'note', btrim(p_note)),
                         '/pending-approval', 'profile', p_profile_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Users & roles
-- ---------------------------------------------------------------------------------------------------
create or replace function public.set_user_roles(p_user_id uuid, p_role_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current  text[];
  v_new      text[];
  v_missing  text;
begin
  if not private.has_org_permission('users', 'administer') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  v_new := array(select distinct btrim(k) from unnest(coalesce(p_role_keys, '{}')) k where btrim(k) <> '' order by 1);
  select k into v_missing from unnest(v_new) k where not exists (select 1 from public.roles r where r.key = k) limit 1;
  if v_missing is not null then
    raise exception 'hr:errors.roleNotFound' using detail = v_missing;
  end if;
  v_current := array(select r.key from public.user_roles ur join public.roles r on r.id = ur.role_id
                     where ur.user_id = p_user_id order by 1);

  -- only a super admin may grant/revoke super_admin or change a super admin's roles at all
  if ('super_admin' = any (v_current) or 'super_admin' = any (v_new)) and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role_id)
  select p_user_id, r.id from public.roles r where r.key = any (v_new)
  on conflict (user_id, role_id) do nothing;
  delete from public.user_roles ur
  using public.roles r
  where r.id = ur.role_id and ur.user_id = p_user_id and not (r.key = any (v_new));

  if v_current is distinct from v_new then
    perform private.write_audit('user.roles_update', 'profile', p_user_id::text,
                                (select email from public.profiles where id = p_user_id),
                                jsonb_build_object('roles', jsonb_build_object('old', to_jsonb(v_current), 'new', to_jsonb(v_new))),
                                (select employee_id from public.profiles where id = p_user_id));
  end if;
end;
$$;

create or replace function public.set_user_status(p_user_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.has_org_permission('users', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_status not in ('active', 'disabled') then
    raise exception 'hr:errors.validation' using detail = 'status';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'hr:errors.forbidden' using errcode = '42501', detail = 'self';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
             where ur.user_id = p_user_id and r.key = 'super_admin')
     and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if v_profile.status = p_status then
    return;
  end if;
  update public.profiles
  set status = p_status, review_note = coalesce(private.nullif_blank(p_note), review_note),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_user_id;
  perform private.write_audit(case when p_status = 'disabled' then 'user.disable' else 'user.enable' end, 'profile',
                              p_user_id::text, v_profile.email, null, v_profile.employee_id);
end;
$$;

create or replace function public.set_user_employee(p_user_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.has_org_permission('users', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
             where ur.user_id = p_user_id and r.key = 'super_admin')
     and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_employee_id is not null then
    if not exists (select 1 from public.employees e where e.id = p_employee_id) then
      raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
    end if;
    if exists (select 1 from public.profiles p where p.employee_id = p_employee_id and p.id <> p_user_id) then
      raise exception 'hr:errors.employeeAlreadyLinked';
    end if;
  end if;
  update public.profiles set employee_id = p_employee_id where id = p_user_id;
end;
$$;

-- Called by the app right after a successful sign-in.
create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'hr:errors.unauthorized' using errcode = '42501';
  end if;
  update public.profiles set last_login_at = now() where id = auth.uid();
  perform private.write_audit('auth.login', 'profile', auth.uid()::text, private.actor_email(), null,
                              (select employee_id from public.profiles where id = auth.uid()));
end;
$$;

-- Manager card for an employee's profile (the employee may not read the manager's full employee row).
create or replace function public.get_employee_manager(p_employee_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.can_view_employee(p_employee_id) then (
    select jsonb_build_object(
      'id', m.id, 'employee_number', m.employee_number, 'name_ar', m.name_ar, 'name_en', m.name_en,
      'job_title_ar', j.name_ar, 'job_title_en', j.name_en, 'company_email', m.company_email, 'avatar_path', m.avatar_path)
    from public.employees e
    join public.employees m on m.id = e.manager_id
    left join public.job_titles j on j.id = m.job_title_id
    where e.id = p_employee_id
  ) end
$$;

-- ---------------------------------------------------------------------------------------------------
-- Leave balances
-- ---------------------------------------------------------------------------------------------------
create or replace function public.adjust_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year int,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal     public.leave_balances;
  v_bal_id  uuid;
  v_lt      public.leave_types;
  v_new     numeric;
  v_id      uuid;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'hr:errors.validation' using detail = 'amount';
  end if;
  if private.nullif_blank(p_reason) is null then
    raise exception 'hr:errors.reasonRequired';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  select * into v_lt from public.leave_types where id = p_leave_type_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'leave_type';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
  end if;

  v_bal_id := private.ensure_leave_balance(p_employee_id, p_leave_type_id, p_year);
  select * into v_bal from public.leave_balances b where b.id = v_bal_id for update;
  update public.leave_balances set adjustment = adjustment + p_amount where id = v_bal.id
  returning remaining into v_new;

  insert into public.leave_adjustments (leave_balance_id, amount, reason, old_remaining, new_remaining, changed_by)
  values (v_bal.id, p_amount, btrim(p_reason), v_bal.remaining, v_new, auth.uid())
  returning id into v_id;

  perform private.notify(
    private.employee_profile_id(p_employee_id), 'leave_balance_adjusted',
    jsonb_build_object('leave_type_name_ar', v_lt.name_ar, 'leave_type_name_en', v_lt.name_en, 'amount', p_amount,
                       'year', p_year, 'old_remaining', v_bal.remaining, 'new_remaining', v_new,
                       'actor_name', private.profile_display_name(auth.uid())),
    '/leave', 'leave_balance', v_bal.id
  );
  return v_id;
end;
$$;

-- Sets opening balance / entitlement of one balance row (creates it when missing). Used by the
-- leave-balance import and the balance editor; used/pending/adjustment stay under RPC control.
create or replace function public.set_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year int,
  p_opening_balance numeric,
  p_entitlement numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_old public.leave_balances;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
  end if;
  if not exists (select 1 from public.leave_types where id = p_leave_type_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'leave_type';
  end if;
  v_id := private.ensure_leave_balance(p_employee_id, p_leave_type_id, p_year);
  select * into v_old from public.leave_balances where id = v_id for update;
  update public.leave_balances
  set opening_balance = coalesce(p_opening_balance, opening_balance),
      entitlement = coalesce(p_entitlement, entitlement)
  where id = v_id;
  perform private.write_audit('leave_balance.update', 'leave_balance', v_id::text, p_year::text,
    jsonb_build_object('opening_balance', jsonb_build_object('old', v_old.opening_balance, 'new', coalesce(p_opening_balance, v_old.opening_balance)),
                       'entitlement', jsonb_build_object('old', v_old.entitlement, 'new', coalesce(p_entitlement, v_old.entitlement))),
    p_employee_id);
  return v_id;
end;
$$;

-- Creates missing balance rows (deducting, active leave types; default entitlement; gender restriction
-- honoured) for all active employees or one employee. Returns the number of rows created.
create or replace function public.initialize_leave_balances(p_year int, p_employee_id uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  insert into public.leave_balances (employee_id, leave_type_id, year, entitlement)
  select e.id, lt.id, p_year, lt.default_entitlement
  from public.employees e
  cross join public.leave_types lt
  where lt.is_active and lt.deducts_balance
    and e.archived_at is null
    and e.employment_status not in ('resigned', 'terminated')
    and (p_employee_id is null or e.id = p_employee_id)
    and (lt.gender_restriction is null or lt.gender_restriction = e.gender)
  on conflict (employee_id, leave_type_id, year) do nothing;
  get diagnostics v_count = row_count;
  perform private.write_audit('leave_balance.initialize', 'leave_balance', p_year::text,
                              p_year::text || ': ' || v_count || ' balances', null, p_employee_id);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Notification e-mail delivery helpers (server code: lib/notifications.ts)
-- ---------------------------------------------------------------------------------------------------
-- Atomically claims notifications created by the caller's own action (or any, for service_role) that
-- still need an e-mail, marks them emailed and returns what is needed to render/send them.
create or replace function public.claim_notification_emails(p_notification_ids uuid[])
returns table (
  notification_id uuid, recipient_email text, recipient_name text, language text, type text, params jsonb,
  link text, template_key text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if auth.uid() is null and not v_service then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select n.id
    from public.notifications n
    join public.profiles p on p.id = n.user_id
    join public.notification_settings ns on ns.event_key = n.type and ns.email_enabled
    where n.id = any (coalesce(p_notification_ids, '{}'))
      and n.emailed_at is null
      and n.created_at > now() - interval '1 day'
      and (v_service or n.created_by = auth.uid())
      and p.email is not null
    for update of n skip locked
  ),
  claimed as (
    update public.notifications n set emailed_at = now()
    from candidates c where n.id = c.id
    returning n.id, n.user_id, n.type, n.params, n.link
  )
  select c.id, p.email, coalesce(p.full_name, private.profile_display_name(p.id)),
         coalesce(p.preferred_language, (select s.default_language from public.organization_settings s limit 1), 'ar'),
         c.type, c.params, c.link,
         case c.type
           when 'account_invited' then 'account_invitation'
           when 'expiry_alert' then coalesce(nullif(c.params ->> 'kind', '') || '_expiry', 'document_expiry')
           else c.type
         end
  from claimed c join public.profiles p on p.id = c.user_id;
end;
$$;

create or replace function public.log_email(
  p_recipient text,
  p_status text,
  p_subject text default null,
  p_template_key text default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_error text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_status not in ('sent', 'failed', 'skipped') or private.nullif_blank(p_recipient) is null then
    raise exception 'hr:errors.validation';
  end if;
  insert into public.email_logs (recipient, subject, template_key, related_entity_type, related_entity_id, status, provider,
                                 provider_message_id, error, sent_at)
  values (left(p_recipient, 320), left(p_subject, 500), p_template_key, p_related_entity_type, p_related_entity_id, p_status,
          p_provider, p_provider_message_id, left(p_error, 2000), case when p_status = 'sent' then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Global search (security invoker → RLS applies to every row returned)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.global_search(p_query text, p_locale text default 'ar', p_limit int default 20)
returns table (kind text, id uuid, title text, subtitle text, href text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q     text := btrim(coalesce(p_query, ''));
  v_norm  text;
  v_like  text;
  v_pd    boolean;
  v_en    boolean := p_locale = 'en';
  v_lim   int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_q) < 2 or not private.is_active_user() then
    return;
  end if;
  v_norm := private.normalize_search(v_q);
  v_like := '%' || replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_pd := private.has_org_permission('personal_data', 'view');

  return query
  select 'employee'::text, e.id,
         case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end,
         concat_ws(' · ', e.employee_number,
                   case when v_en then coalesce(nullif(j.name_en, ''), j.name_ar) else coalesce(nullif(j.name_ar, ''), j.name_en) end),
         '/employees/' || e.id
  from public.employees e
  left join public.job_titles j on j.id = e.job_title_id
  where e.archived_at is null
    and (
      private.normalize_search(e.name_ar) like v_like
      or private.normalize_search(e.name_en) like v_like
      or lower(coalesce(e.employee_number, '')) like v_like
      or lower(coalesce(e.company_email, '')) like v_like
      or (v_pd and e.national_id = v_q)
    )
  order by (lower(coalesce(e.employee_number, '')) = lower(v_q)) desc, (v_pd and e.national_id = v_q) desc,
           coalesce(e.name_ar, e.name_en)
  limit v_lim;

  return query
  select 'request'::text, r.id, r.request_number,
         concat_ws(' · ', case when v_en then t.name_en else t.name_ar end,
                   case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end),
         '/requests/' || r.id
  from public.hr_requests r
  join public.request_types t on t.id = r.request_type_id
  join public.employees e on e.id = r.employee_id
  where r.request_number is not null and lower(r.request_number) like v_like
  order by r.created_at desc
  limit v_lim;

  return query
  select 'certificate'::text, c.id, c.certificate_number,
         concat_ws(' · ', case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end,
                   c.certificate_type),
         '/certificates?q=' || c.certificate_number
  from public.certificates c
  join public.employees e on e.id = c.employee_id
  where lower(c.certificate_number) like v_like
  order by c.created_at desc
  limit v_lim;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Public (anon) RPCs
-- ---------------------------------------------------------------------------------------------------
-- Returns ONLY certificate_number, employee_name, certificate_type, issue_date, status.
create or replace function public.verify_certificate(p_number text)
returns table (certificate_number text, employee_name text, certificate_type text, issue_date date, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.certificate_number,
         case c.language
           when 'en' then coalesce(nullif(e.name_en, ''), e.name_ar)
           when 'ar' then coalesce(nullif(e.name_ar, ''), e.name_en)
           else concat_ws(' / ', nullif(e.name_ar, ''), nullif(e.name_en, ''))
         end,
         c.certificate_type, c.issue_date, c.status
  from public.certificates c
  join public.employees e on e.id = c.employee_id
  where p_number is not null
    and length(p_number) <= 40
    and upper(btrim(p_number)) = c.certificate_number
  limit 1
$$;

create or replace function public.get_public_branding()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'portal_name_ar', s.portal_name_ar,
    'portal_name_en', s.portal_name_en,
    'company_name_ar', o.name_ar,
    'company_name_en', o.name_en,
    'logo_bucket', 'branding',
    'logo_path', o.logo_path,
    'login_image_path', s.login_image_path,
    'primary_color', s.primary_color,
    'secondary_color', s.secondary_color,
    'login_title_ar', s.login_title_ar,
    'login_title_en', s.login_title_en,
    'login_subtitle_ar', s.login_subtitle_ar,
    'login_subtitle_en', s.login_subtitle_en,
    'default_language', s.default_language,
    'allow_self_registration', s.allow_self_registration,
    'setup_completed', s.setup_completed_at is not null
  )
  from (select 1) as one
  left join public.organization_settings s on true
  left join public.organizations o on true
$$;

-- ---------------------------------------------------------------------------------------------------
-- Dashboard statistics (security invoker: RLS scopes every count; sections gated by role)
-- Expiry buckets are exclusive: expired (< today), within7 (0–7 days), within14 (8–14), within30 (15–30),
-- within60 (31–60), within90 (61–90).
-- ---------------------------------------------------------------------------------------------------
create or replace function private.expiry_buckets(p_dates date[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (select x - private.org_today() as n from unnest(p_dates) as x where x is not null)
  select jsonb_build_object(
    'expired', count(*) filter (where n < 0),
    'within7', count(*) filter (where n between 0 and 7),
    'within14', count(*) filter (where n between 8 and 14),
    'within30', count(*) filter (where n between 15 and 30),
    'within60', count(*) filter (where n between 31 and 60),
    'within90', count(*) filter (where n between 61 and 90)
  )
  from d
$$;

create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result  jsonb := '{}'::jsonb;
  v_me      uuid := private.current_employee_id();
  v_today   date := private.org_today();
  v_year    int := extract(year from private.org_today())::int;
  v_open    text[] := array['submitted', 'pending_manager_approval', 'pending_hr_review'];
begin
  if not private.is_active_user() then
    return jsonb_build_object('scope', 'none');
  end if;

  -- employee (own)
  if v_me is not null then
    v_result := v_result || jsonb_build_object('employee', jsonb_build_object(
      'open_requests', (select count(*) from public.hr_requests r where r.employee_id = v_me
                          and r.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'returned', 'approved', 'in_progress')),
      'returned_requests', (select count(*) from public.hr_requests r where r.employee_id = v_me and r.status = 'returned'),
      'draft_requests', (select count(*) from public.hr_requests r where r.requester_id = auth.uid() and r.status = 'draft'),
      'certificates', (select count(*) from public.certificates c where c.employee_id = v_me and c.status = 'valid'),
      'documents_expiring', (select count(*) from public.employee_documents d where d.employee_id = v_me
                               and d.expiry_date is not null and d.expiry_date <= v_today + 90 and d.status <> 'archived'),
      'upcoming_leave', (select count(*) from public.leave_requests lr join public.hr_requests r on r.id = lr.request_id
                           where lr.employee_id = v_me and lr.end_date >= v_today and r.status in ('approved', 'in_progress', 'completed')),
      'leave_balances', coalesce((
        select jsonb_agg(jsonb_build_object('leave_type_id', lt.id, 'code', lt.code, 'name_ar', lt.name_ar, 'name_en', lt.name_en,
                                            'color', lt.color, 'remaining', b.remaining, 'pending', b.pending, 'used', b.used,
                                            'available', b.remaining - b.pending) order by lt.sort_order)
        from public.leave_balances b join public.leave_types lt on lt.id = b.leave_type_id
        where b.employee_id = v_me and b.year = v_year and lt.is_active), '[]'::jsonb),
      'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null)
    ));
  end if;

  -- manager (direct reports)
  if v_me is not null and exists (select 1 from public.employees e where e.manager_id = v_me and e.archived_at is null) then
    v_result := v_result || jsonb_build_object('manager', jsonb_build_object(
      'direct_reports', (select count(*) from public.employees e where e.manager_id = v_me and e.archived_at is null),
      'pending_approvals', (select count(*) from public.hr_requests r where r.current_approver_id = auth.uid()
                              and r.status in ('pending_manager_approval', 'pending_hr_review')),
      'team_on_leave_today', (select count(distinct lr.employee_id) from public.leave_requests lr
                                join public.hr_requests r on r.id = lr.request_id
                                join public.employees e on e.id = lr.employee_id
                                where e.manager_id = v_me and v_today between lr.start_date and lr.end_date
                                  and r.status in ('approved', 'in_progress', 'completed')),
      'team_upcoming_leave', (select count(*) from public.leave_requests lr
                                join public.hr_requests r on r.id = lr.request_id
                                join public.employees e on e.id = lr.employee_id
                                where e.manager_id = v_me and lr.start_date > v_today and lr.start_date <= v_today + 14
                                  and r.status in ('approved', 'in_progress', 'completed', 'pending_manager_approval', 'pending_hr_review')),
      'team_open_requests', (select count(*) from public.hr_requests r join public.employees e on e.id = r.employee_id
                               where e.manager_id = v_me and r.status = any (v_open))
    ));
  end if;

  -- HR (organization)
  if private.has_org_permission('employees', 'view') or private.has_org_permission('requests', 'view') then
    v_result := v_result || jsonb_build_object('hr', jsonb_build_object(
      'total_employees', (select count(*) from public.employees e where e.archived_at is null
                            and e.employment_status not in ('resigned', 'terminated')),
      'employees_by_status', coalesce((select jsonb_object_agg(s, c) from (
                                select e.employment_status as s, count(*) as c from public.employees e
                                where e.archived_at is null group by 1) x), '{}'::jsonb),
      'new_joiners_30d', (select count(*) from public.employees e where e.archived_at is null
                            and e.joining_date between v_today - 30 and v_today),
      'pending_requests', (select count(*) from public.hr_requests r where r.status = any (v_open)),
      'pending_hr_review', (select count(*) from public.hr_requests r where r.status = 'pending_hr_review'),
      'pending_my_action', (select count(*) from public.hr_requests r where r.status = 'pending_hr_review'
                              and (r.assigned_to is null or r.assigned_to = auth.uid())
                              and r.current_step_type = 'hr'),
      'in_progress_requests', (select count(*) from public.hr_requests r where r.status in ('approved', 'in_progress')),
      'overdue_requests', (select count(*) from public.hr_requests r where r.status = any (v_open) and r.due_at < now()),
      'due_soon_requests', (select count(*) from public.hr_requests r where r.status = any (v_open)
                              and r.due_at >= now() and r.due_at < now() + interval '1 day'),
      'on_leave_today', (select count(distinct lr.employee_id) from public.leave_requests lr
                           join public.hr_requests r on r.id = lr.request_id
                           where v_today between lr.start_date and lr.end_date
                             and r.status in ('approved', 'in_progress', 'completed')),
      'upcoming_leave_7d', (select count(*) from public.leave_requests lr join public.hr_requests r on r.id = lr.request_id
                              where lr.start_date > v_today and lr.start_date <= v_today + 7
                                and r.status in ('approved', 'in_progress', 'completed')),
      'certificates_issued_30d', (select count(*) from public.certificates c where c.issue_date >= v_today - 30),
      'pending_registrations', (select count(*) from public.profiles p where p.status in ('pending', 'info_requested')),
      'expiring', jsonb_build_object(
        'iqama', private.expiry_buckets(array(select e.iqama_expiry_date from public.employees e
                   where e.archived_at is null and e.employment_status not in ('resigned', 'terminated'))),
        'passport', private.expiry_buckets(array(select e.passport_expiry_date from public.employees e
                   where e.archived_at is null and e.employment_status not in ('resigned', 'terminated'))),
        'contract', private.expiry_buckets(array(select e.contract_end_date from public.employees e
                   where e.archived_at is null and e.employment_status not in ('resigned', 'terminated'))),
        'insurance', private.expiry_buckets(array(select i.expiry_date from public.employee_insurance i
                   join public.employees e on e.id = i.employee_id
                   where i.status in ('active', 'pending') and e.archived_at is null)),
        'documents', private.expiry_buckets(array(select d.expiry_date from public.employee_documents d
                   join public.employees e on e.id = d.employee_id
                   where d.status not in ('archived', 'rejected') and e.archived_at is null))
      )
    ));
  end if;

  -- administration
  if private.is_super_admin() or private.has_org_permission('users', 'view') then
    v_result := v_result || jsonb_build_object('admin', jsonb_build_object(
      'users_total', (select count(*) from public.profiles),
      'users_by_status', coalesce((select jsonb_object_agg(s, c) from (
                            select p.status as s, count(*) as c from public.profiles p group by 1) x), '{}'::jsonb),
      'roles', (select count(*) from public.roles),
      'setup_completed', (select s.setup_completed_at is not null from public.organization_settings s limit 1),
      'active_request_types', (select count(*) from public.request_types t where t.is_active),
      'active_leave_types', (select count(*) from public.leave_types t where t.is_active),
      'departments', (select count(*) from public.departments d where d.is_active),
      'imports_last_30d', (select count(*) from public.imports i where i.created_at >= now() - interval '30 days'),
      'audit_events_24h', case when private.has_org_permission('audit', 'view')
                            then (select count(*) from public.audit_logs a where a.created_at >= now() - interval '24 hours') end
    ));
  end if;

  return v_result || jsonb_build_object('generated_at', now(), 'today', v_today);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Expiry alerts (cron route, service_role only): notifies HR (employees.view org) and the employee at
-- each threshold in organization_settings.expiry_alert_days and on the expiry day. Idempotent per day.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.generate_expiry_alerts()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := private.org_today();
  v_days    int[];
  v_hr      uuid[];
  v_item    record;
  v_to      uuid[];
  v_count   int := 0;
  v_uid     uuid;
  v_params  jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select coalesce(s.expiry_alert_days, '{90,60,30,14,7}') || 0 into v_days from public.organization_settings s limit 1;
  v_days := coalesce(v_days, '{90,60,30,14,7,0}');
  v_hr := array(select private.users_with_org_permission('employees', 'view'));

  for v_item in
    select 'iqama'::text as kind, e.id as employee_id, e.iqama_expiry_date as expiry_date, null::text as document_type, e.id as entity_id
      from public.employees e where e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
        and e.iqama_expiry_date - v_today = any (v_days)
    union all
    select 'passport', e.id, e.passport_expiry_date, null, e.id
      from public.employees e where e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
        and e.passport_expiry_date - v_today = any (v_days)
    union all
    select 'contract', e.id, e.contract_end_date, null, e.id
      from public.employees e where e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
        and e.contract_end_date - v_today = any (v_days)
    union all
    select 'insurance', i.employee_id, i.expiry_date, null, i.id
      from public.employee_insurance i join public.employees e on e.id = i.employee_id
      where e.archived_at is null and i.status in ('active', 'pending') and i.expiry_date - v_today = any (v_days)
    union all
    select 'document', d.employee_id, d.expiry_date, d.document_type, d.id
      from public.employee_documents d join public.employees e on e.id = d.employee_id
      where e.archived_at is null and d.status not in ('archived', 'rejected') and d.expiry_date - v_today = any (v_days)
  loop
    select jsonb_build_object('kind', v_item.kind, 'expiry_date', v_item.expiry_date, 'days_left', v_item.expiry_date - v_today,
                              'document_type', v_item.document_type, 'employee_id', e.id, 'employee_name_ar', e.name_ar,
                              'employee_name_en', e.name_en, 'employee_number', e.employee_number)
      into v_params
    from public.employees e where e.id = v_item.employee_id;
    v_to := v_hr;
    if v_item.kind in ('iqama', 'passport', 'document', 'insurance') then
      v_to := v_to || private.employee_profile_id(v_item.employee_id);
    end if;
    for v_uid in select distinct u from unnest(v_to) u where u is not null loop
      continue when exists (
        select 1 from public.notifications n
        where n.user_id = v_uid and n.type = 'expiry_alert' and n.entity_id = v_item.entity_id
          and n.params ->> 'kind' = v_item.kind and n.created_at::date = current_date
      );
      if private.notify(v_uid, 'expiry_alert', v_params, '/employees/' || v_item.employee_id, 'employee', v_item.entity_id) is not null then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Certificate template versioning
-- ---------------------------------------------------------------------------------------------------
create or replace function public.publish_certificate_template(p_template_id uuid, p_change_notes text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl     public.certificate_templates;
  v_version int;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_tpl from public.certificate_templates where id = p_template_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  v_version := coalesce((select max(v.version) from public.certificate_template_versions v where v.template_id = p_template_id), 0) + 1;
  update public.certificate_templates set current_version = v_version, published_at = now() where id = p_template_id
  returning * into v_tpl;
  insert into public.certificate_template_versions (template_id, version, snapshot, change_notes, changed_by)
  values (p_template_id, v_version,
          to_jsonb(v_tpl) - array['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'current_version', 'published_at'],
          private.nullif_blank(p_change_notes), auth.uid());
  return v_version;
end;
$$;

create or replace function public.restore_certificate_template_version(p_template_id uuid, p_version int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snap jsonb;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select v.snapshot into v_snap from public.certificate_template_versions v where v.template_id = p_template_id and v.version = p_version;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  update public.certificate_templates
  set name_ar = coalesce(v_snap ->> 'name_ar', name_ar),
      name_en = coalesce(v_snap ->> 'name_en', name_en),
      language = coalesce(v_snap ->> 'language', language),
      content_ar = v_snap ->> 'content_ar',
      content_en = v_snap ->> 'content_en',
      header_html = v_snap ->> 'header_html',
      footer_html = v_snap ->> 'footer_html',
      show_logo = coalesce((v_snap ->> 'show_logo')::boolean, show_logo),
      show_stamp = coalesce((v_snap ->> 'show_stamp')::boolean, show_stamp),
      show_signature = coalesce((v_snap ->> 'show_signature')::boolean, show_signature),
      show_qr = coalesce((v_snap ->> 'show_qr')::boolean, show_qr)
  where id = p_template_id;
  perform public.publish_certificate_template(p_template_id, 'restored from version ' || p_version);
end;
$$;
