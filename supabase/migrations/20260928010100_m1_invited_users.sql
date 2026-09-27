-- =====================================================================================================
-- M1 — admin-invited users created through the GoTrue admin API
--
-- GoTrue's `auth.admin.createUser({ app_metadata })` INSERTs the auth user with only the provider
-- metadata and writes the caller's `app_metadata` in a second UPDATE. The insert hook
-- (`private.handle_new_auth_user`) therefore sees a self sign-up: the profile starts `pending` and the
-- registration reviewers are notified. This hook completes the documented contract (docs/DATABASE.md
-- §15): when `raw_app_meta_data.invited_by_admin` becomes true for a fresh, never-reviewed, unlinked
-- `pending` profile, the account becomes an admin-provisioned one — `active`, `invited_at` stamped,
-- registration suggestion cleared, the spurious reviewer notifications removed and `user.invite`
-- audited. `app_metadata` can only be written with the service-role key, so users cannot trigger it.
-- Idempotent.
-- =====================================================================================================

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
  if v_profile.status <> 'pending'
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
      matched_employee_id = null
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

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
  after update of raw_app_meta_data on auth.users
  for each row
  when ((old.raw_app_meta_data ->> 'invited_by_admin') is distinct from 'true'
        and (new.raw_app_meta_data ->> 'invited_by_admin') = 'true')
  execute function private.handle_auth_user_invited();
