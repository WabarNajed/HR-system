-- Notification e-mails: greet the recipient in the e-mail's language.
--
-- `claim_notification_emails` returned `profiles.full_name` as `recipient_name` regardless of the e-mail
-- language, so an Arabic e-mail to an employee-linked user read "مرحبًا QA Employee One، … مقدَّم من
-- QA موظف العمليات الأول" (English greeting, Arabic body). When the profile is linked to an employee the
-- name now follows the same localized rule used for `employee_name` (src/lib/i18n/localized.ts
-- employeeDisplayName): Arabic → name_ar, else name_en; English → name_en, else name_ar. Profiles without
-- a linked employee keep `full_name` (then the e-mail address) as before.
--
-- Same signature and OUT columns as 20260928012000_integration_rpc_fixes.sql, so CREATE OR REPLACE keeps
-- grants; they are re-asserted below anyway. Authorization checks are unchanged.

create or replace function public.claim_notification_emails(p_notification_ids uuid[])
returns table (
  notification_id uuid, recipient_email text, recipient_name text, language text, type text, params jsonb,
  link text, template_key text,
  -- template in `language` (falls back to the other language when that side is blank);
  -- all null when the template is missing, template_active = false when it is switched off
  template_active boolean, subject text, body text,
  email_from_name text, email_reply_to text
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
  ),
  recipients as (
    select c.id, c.type, c.params, c.link, p.email, p.full_name,
           nullif(btrim(e.name_ar), '') as emp_name_ar,
           nullif(btrim(e.name_en), '') as emp_name_en,
           coalesce(p.preferred_language, (select s.default_language from public.organization_settings s limit 1), 'ar')
             as lang
    from claimed c
    join public.profiles p on p.id = c.user_id
    left join public.employees e on e.id = p.employee_id
  ),
  resolved as (
    select r.id, r.type, r.params, r.link, r.email, r.lang,
           coalesce(
             case when r.lang = 'en' then coalesce(r.emp_name_en, r.emp_name_ar)
                  else coalesce(r.emp_name_ar, r.emp_name_en) end,
             nullif(btrim(r.full_name), ''),
             r.email
           ) as recipient_name,
           case r.type
             when 'account_invited' then 'account_invitation'
             when 'expiry_alert' then coalesce(nullif(r.params ->> 'kind', '') || '_expiry', 'document_expiry')
             else r.type
           end as tkey
    from recipients r
  )
  select r.id, r.email, r.recipient_name, r.lang, r.type, r.params, r.link, r.tkey,
         t.is_active,
         case when r.lang = 'en' then coalesce(nullif(btrim(t.subject_en), ''), t.subject_ar)
              else coalesce(nullif(btrim(t.subject_ar), ''), t.subject_en) end,
         case when r.lang = 'en' then coalesce(nullif(btrim(t.body_en), ''), t.body_ar)
              else coalesce(nullif(btrim(t.body_ar), ''), t.body_en) end,
         os.email_from_name, os.email_reply_to
  from resolved r
  left join public.email_templates t on t.key = r.tkey
  left join lateral (select s.email_from_name, s.email_reply_to from public.organization_settings s limit 1) os on true;
end;
$$;

comment on function public.claim_notification_emails(uuid[]) is
  'Claims (marks emailed_at) notifications created by the caller''s own action (any for service_role) whose event has e-mail enabled, and returns recipient (name localized to the e-mail language when linked to an employee), params and the e-mail template in the recipient''s language. See docs/DATABASE.md §11.';

revoke execute on function public.claim_notification_emails(uuid[]) from public, anon;
grant execute on function public.claim_notification_emails(uuid[]) to authenticated, service_role;
