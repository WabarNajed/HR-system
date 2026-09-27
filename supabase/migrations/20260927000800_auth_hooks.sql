-- =====================================================================================================
-- HR Portal — auth.users hooks
-- * INSERT → public.profiles row. Self sign-ups start as 'pending'. raw_user_meta_data (full_name,
--   mobile, employee_number) is UNTRUSTED input: it is copied into registration fields only and never
--   decides status or roles. Users created by an admin with raw_app_meta_data.invited_by_admin = true
--   (app_metadata can only be set with the service-role key) start 'active' with invited_at set; roles
--   and the employee link are then assigned by server code (service role) or approve_registration.
-- * UPDATE of email → profiles.email kept in sync.
-- =====================================================================================================

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_invited  boolean := coalesce(new.raw_app_meta_data ->> 'invited_by_admin', 'false') = 'true';
  v_input    text;
  v_match    uuid;
  v_name     text;
  v_mobile   text;
  v_lang     text;
begin
  v_input := left(private.nullif_blank(coalesce(v_meta ->> 'employee_number', v_meta ->> 'registration_employee_number',
                                                v_meta ->> 'employee_id')), 64);
  v_name := left(private.nullif_blank(v_meta ->> 'full_name'), 200);
  v_mobile := left(private.nullif_blank(v_meta ->> 'mobile'), 32);
  v_lang := case when v_meta ->> 'preferred_language' in ('ar', 'en') then v_meta ->> 'preferred_language' end;

  if v_input is not null then
    -- suggestion only: a unique, not yet linked, non-archived employee whose number or national ID matches
    select e.id into v_match
    from public.employees e
    where e.archived_at is null
      and (lower(e.employee_number) = lower(v_input) or e.national_id = v_input)
      and not exists (select 1 from public.profiles p where p.employee_id = e.id)
    limit 2;
    if (select count(*) from public.employees e
        where e.archived_at is null and (lower(e.employee_number) = lower(v_input) or e.national_id = v_input)) > 1 then
      v_match := null;
    end if;
  end if;

  insert into public.profiles (id, email, full_name, mobile, status, registration_employee_number, registration_note,
                               matched_employee_id, invited_at, preferred_language)
  values (
    new.id, lower(new.email), v_name, v_mobile,
    case when v_invited then 'active' else 'pending' end,
    case when v_invited then null else v_input end,
    case when v_invited then null else left(private.nullif_blank(v_meta ->> 'registration_note'), 1000) end,
    case when v_invited then null else v_match end,
    case when v_invited then now() end,
    v_lang
  )
  on conflict (id) do nothing;

  if v_invited then
    perform private.write_audit('user.invite', 'profile', new.id::text, lower(new.email), null, null);
  else
    perform private.write_audit('registration.submit', 'profile', new.id::text, lower(new.email),
                                jsonb_build_object('employee_number', v_input, 'matched_employee_id', v_match), null);
    perform private.notify_many(
      array(select private.users_with_org_permission('users', 'approve')),
      'registration_submitted',
      jsonb_build_object('full_name', v_name, 'email', lower(new.email), 'employee_number', v_input,
                         'matched', v_match is not null),
      '/settings/pending-registrations', 'profile', new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function private.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id and email is distinct from lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_auth_user_email_change();
