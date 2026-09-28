-- =====================================================================================================
-- M1 — registration gate + approval privilege check
--
-- 1. `organization_settings.allow_self_registration = false` was only enforced by the portal's
--    /register Server Action. GoTrue's public sign-up endpoint (anon key) still created a `pending`
--    profile and notified every registration reviewer. The gate below (AFTER INSERT on auth.users,
--    fires after `on_auth_user_created`) turns such sign-ups into a closed, auto-rejected
--    registration and removes the reviewer notifications. Admin-provisioned accounts are unaffected:
--    GoTrue writes their `invited_by_admin` app metadata in a second step, and
--    `private.handle_auth_user_invited` (updated here) activates an auto-rejected, never-reviewed,
--    fresh profile exactly like a pending one.
-- 2. `approve_registration` let anyone holding `users.approve` grant ANY role on approval (e.g. a
--    custom reviewer role granting `hr_admin`). Granting a role other than `employee` now also needs
--    `users.administer` — the permission `set_user_roles` requires.
-- Idempotent.
-- =====================================================================================================

-- ─── 1. registration gate ────────────────────────────────────────────────────────────────────────

create or replace function private.handle_auth_user_registration_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_lang text;
begin
  if coalesce(new.raw_app_meta_data ->> 'invited_by_admin', 'false') = 'true' then
    return new;
  end if;
  select s.allow_self_registration, s.default_language into v_open, v_lang
  from public.organization_settings s
  limit 1;
  if coalesce(v_open, true) then
    return new;
  end if;

  update public.profiles
  set status = 'rejected',
      matched_employee_id = null,
      review_note = case when coalesce(v_lang, 'ar') = 'en'
                         then 'Self-registration is currently closed. Please contact HR for access.'
                         else 'التسجيل الذاتي مغلق حاليًا. يُرجى التواصل مع الموارد البشرية للحصول على صلاحية الدخول.'
                    end
  where id = new.id
    and status = 'pending'
    and reviewed_at is null
    and employee_id is null;
  if not found then
    return new;
  end if;

  delete from public.notifications n
  where n.type = 'registration_submitted'
    and n.entity_type = 'profile'
    and n.entity_id = new.id
    and n.emailed_at is null;

  perform private.write_audit('registration.blocked', 'profile', new.id::text, lower(new.email),
                              jsonb_build_object('reason', 'self_registration_closed'), null);
  return new;
end;
$$;

revoke execute on function private.handle_auth_user_registration_gate() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_registration_gate on auth.users;
create trigger on_auth_user_created_registration_gate
  after insert on auth.users
  for each row
  execute function private.handle_auth_user_registration_gate();

-- Admin-invited accounts: also accept a fresh profile the gate auto-rejected (never reviewed).
create or replace function private.handle_auth_user_invited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where id = new.id for update;
  if not found then
    return new;
  end if;
  -- never touch an account HR already reviewed, linked, or that registered a while ago
  if v_profile.status not in ('pending', 'rejected')
     or v_profile.reviewed_at is not null
     or v_profile.employee_id is not null
     or v_profile.created_at < now() - interval '10 minutes' then
    return new;
  end if;

  update public.profiles
  set status = 'active',
      invited_at = coalesce(invited_at, now()),
      registration_employee_number = null,
      registration_note = null,
      matched_employee_id = null,
      review_note = null
  where id = new.id;

  delete from public.notifications n
  where n.type = 'registration_submitted'
    and n.entity_type = 'profile'
    and n.entity_id = new.id
    and n.emailed_at is null;

  perform private.write_audit('user.invite', 'profile', new.id::text, lower(new.email), null, null);
  return new;
end;
$$;

revoke execute on function private.handle_auth_user_invited() from public, anon, authenticated;

-- ─── 2. approve_registration: roles other than `employee` need users.administer ───────────────────

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
  if v_role.key <> 'employee' and not private.has_org_permission('users', 'administer') then
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

revoke execute on function public.approve_registration(uuid, uuid, text) from public, anon;
grant execute on function public.approve_registration(uuid, uuid, text) to authenticated;
