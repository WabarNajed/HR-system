-- =====================================================================================================
-- Platform DB fix — the audit trail and the e-mail log can no longer be forged from a user JWT.
--
-- Before: `log_audit_event` accepted ANY signed-in JWT (even disabled / pending users) with an arbitrary
-- action, entity and summary — e.g. a fake `employee.update` row on someone's Activity tab or a fake
-- `user.role_change`; `log_email` let every active user insert fake "sent" rows into `email_logs`;
-- `record_login` let disabled users stamp `last_login_at` and flood `auth.login` events.
--
-- After:
--   * `log_audit_event` is SERVICE-ROLE ONLY. Application events are written by server code
--     (`src/lib/audit.ts`) after the action's own permission check, through the service-role client.
--     The server passes the verified actor (session `sub`) and the end-user's IP / user agent.
--   * `log_email` is SERVICE-ROLE ONLY (`recordEmail` already uses the service-role client).
--   * `record_login` only for non-blocked profiles (pending / info_requested / active) and writes at
--     most ONE `auth.login` event per auth session (`session_id` JWT claim) — repeated calls are no-ops.
-- Idempotent.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- log_audit_event — service role only, explicit actor + request metadata
-- ---------------------------------------------------------------------------------------------------
drop function if exists public.log_audit_event(text, text, text, text, jsonb);

create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_summary text default null,
  p_changes jsonb default null,
  p_actor_id uuid default null,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_email text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$' or length(p_action) > 100 then
    raise exception 'hr:errors.validation' using detail = 'action';
  end if;
  if coalesce(current_setting('hr.suppress_audit', true), '') = 'on' then
    return;
  end if;
  if p_actor_id is not null then
    select coalesce(
      (select p.email from public.profiles p where p.id = p_actor_id),
      (select u.email::text from auth.users u where u.id = p_actor_id)
    ) into v_actor_email;
    if v_actor_email is null then
      raise exception 'hr:errors.validation' using detail = 'actor';
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, employee_id, summary, changes, ip, user_agent)
  values (
    p_actor_id,
    v_actor_email,
    p_action,
    left(p_entity_type, 100),
    left(p_entity_id, 200),
    case when p_entity_type in ('employee', 'employees') then private.try_uuid(p_entity_id) end,
    left(p_summary, 500),
    private.mask_changes(p_changes),
    coalesce(left(nullif(btrim(p_ip), ''), 100), private.request_ip()),
    coalesce(left(nullif(btrim(p_user_agent), ''), 500), private.request_user_agent())
  );
end;
$$;

comment on function public.log_audit_event(text, text, text, text, jsonb, uuid, text, text) is
  'Service role only. Append an application audit event for p_actor_id (the verified session user; null = system). '
  'Sensitive keys in p_changes are masked. Server code calls it via src/lib/audit.ts after its own permission check.';

revoke all on function public.log_audit_event(text, text, text, text, jsonb, uuid, text, text) from public, anon, authenticated;
grant execute on function public.log_audit_event(text, text, text, text, jsonb, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- log_email — service role only
-- ---------------------------------------------------------------------------------------------------
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
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('sent', 'failed', 'skipped') or private.nullif_blank(p_recipient) is null then
    raise exception 'hr:errors.validation';
  end if;
  insert into public.email_logs (recipient, subject, template_key, related_entity_type, related_entity_id, status, provider,
                                 provider_message_id, error, sent_at)
  values (left(p_recipient, 320), left(p_subject, 500), left(p_template_key, 100), left(p_related_entity_type, 100),
          p_related_entity_id, p_status, left(p_provider, 50), left(p_provider_message_id, 200), left(p_error, 2000),
          case when p_status = 'sent' then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.log_email(text, text, text, text, text, uuid, text, text, text) is
  'Service role only. Writes one email_logs row (recordEmail in src/lib/email/send.ts).';

revoke all on function public.log_email(text, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.log_email(text, text, text, text, text, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------------
-- record_login — non-blocked profiles only; one auth.login event per auth session
-- ---------------------------------------------------------------------------------------------------
create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_status  text;
  v_emp     uuid;
  v_session text := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '');
begin
  if v_uid is null then
    raise exception 'hr:errors.unauthorized' using errcode = '42501';
  end if;
  select p.status, p.employee_id into v_status, v_emp from public.profiles p where p.id = v_uid;
  if v_status is null or v_status in ('disabled', 'rejected') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  -- The app calls this after every sign-in path (password, e-mail links); a session is recorded once.
  if v_session is not null and exists (
    select 1 from public.audit_logs a
    where a.actor_id = v_uid
      and a.created_at > now() - interval '30 days'  -- (actor_id, created_at) index range
      and a.action = 'auth.login'
      and a.changes ->> 'session_id' = v_session
  ) then
    return;
  end if;
  update public.profiles set last_login_at = now() where id = v_uid;
  perform private.write_audit('auth.login', 'profile', v_uid::text, private.actor_email(),
                              case when v_session is not null then jsonb_build_object('session_id', v_session) end,
                              v_emp);
end;
$$;

comment on function public.record_login() is
  'Signed-in, non-blocked user (pending / info_requested / active): stamps last_login_at and writes one auth.login '
  'audit event per auth session (JWT session_id). Disabled / rejected → forbidden.';

revoke all on function public.record_login() from public, anon;
grant execute on function public.record_login() to authenticated, service_role;

notify pgrst, 'reload schema';
