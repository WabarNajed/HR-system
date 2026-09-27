-- ===================================================================================================
-- Integration fixes for three foundation RPCs (idempotent: safe to re-run).
--
-- 1. get_public_branding()        + hr_email, so pending / disabled / signed-out users (who cannot read
--                                   public.organizations) can see the "contact HR" address.
-- 2. claim_notification_emails()  also returns the e-mail template (subject/body in the recipient's
--                                   language) and the sender settings, so e-mail delivery works for every
--                                   actor without the service role (non-HR users cannot read
--                                   email_templates through RLS). The template content is configuration,
--                                   returned only for notifications the caller has just claimed.
-- 3. global_search()              certificate subtitles are localized (template name in p_locale, else a
--                                   built-in label) instead of the raw certificate_type key; the raw key is
--                                   returned in the new column type_key for client-side translation
--                                   (enums.certificateType.<key> / request type key).
-- ===================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- 1. Public branding (+ hr_email)
-- ---------------------------------------------------------------------------------------------------
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
    'hr_email', o.hr_email,
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

revoke execute on function public.get_public_branding() from public;
grant execute on function public.get_public_branding() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- 2. Notification e-mail claim (+ template and sender settings)
-- ---------------------------------------------------------------------------------------------------
-- The OUT columns change, so the function has to be dropped first (nothing in the database depends on it).
drop function if exists public.claim_notification_emails(uuid[]);

create function public.claim_notification_emails(p_notification_ids uuid[])
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
  resolved as (
    select c.id, c.type, c.params, c.link, p.email,
           coalesce(p.full_name, private.profile_display_name(p.id)) as recipient_name,
           coalesce(p.preferred_language, (select s.default_language from public.organization_settings s limit 1), 'ar')
             as lang,
           case c.type
             when 'account_invited' then 'account_invitation'
             when 'expiry_alert' then coalesce(nullif(c.params ->> 'kind', '') || '_expiry', 'document_expiry')
             else c.type
           end as tkey
    from claimed c
    join public.profiles p on p.id = c.user_id
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
  'Claims (marks emailed_at) notifications created by the caller''s own action (any for service_role) whose event has e-mail enabled, and returns recipient, params and the e-mail template in the recipient''s language. See docs/DATABASE.md §11.';

revoke execute on function public.claim_notification_emails(uuid[]) from public, anon;
grant execute on function public.claim_notification_emails(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- 3. Global search (localized certificate subtitle + raw type_key)
-- ---------------------------------------------------------------------------------------------------
drop function if exists public.global_search(text, text, int);

create function public.global_search(p_query text, p_locale text default 'ar', p_limit int default 20)
returns table (kind text, id uuid, title text, subtitle text, href text, type_key text)
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
         '/employees/' || e.id,
         null::text
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
         concat_ws(' · ',
                   case when v_en then coalesce(nullif(t.name_en, ''), t.name_ar) else coalesce(nullif(t.name_ar, ''), t.name_en) end,
                   case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end),
         '/requests/' || r.id,
         t.key
  from public.hr_requests r
  join public.request_types t on t.id = r.request_type_id
  join public.employees e on e.id = r.employee_id
  where r.request_number is not null and lower(r.request_number) like v_like
  order by r.created_at desc
  limit v_lim;

  return query
  select 'certificate'::text, c.id, c.certificate_number,
         concat_ws(' · ',
                   case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end,
                   coalesce(
                     case when v_en then coalesce(nullif(ct.name_en, ''), ct.name_ar) else coalesce(nullif(ct.name_ar, ''), ct.name_en) end,
                     case c.certificate_type
                       when 'salary' then case when v_en then 'Salary certificate' else 'تعريف بالراتب' end
                       when 'employment' then case when v_en then 'Employment certificate' else 'شهادة تعريف بالعمل' end
                       when 'salary_employment' then case when v_en then 'Salary & employment certificate' else 'تعريف بالعمل والراتب' end
                       when 'experience' then case when v_en then 'Experience certificate' else 'شهادة خبرة' end
                       when 'custom' then case when v_en then 'Custom HR letter' else 'خطاب موارد بشرية مخصص' end
                     end)),
         '/certificates?q=' || c.certificate_number,
         c.certificate_type
  from public.certificates c
  join public.employees e on e.id = c.employee_id
  left join public.certificate_templates ct on ct.id = c.template_id
  where lower(c.certificate_number) like v_like
  order by c.created_at desc
  limit v_lim;
end;
$$;

comment on function public.global_search(text, text, int) is
  'Header search (security invoker, RLS applies): employees, requests and certificates. subtitle is localized for p_locale; type_key carries the raw request type key / certificate_type.';

revoke execute on function public.global_search(text, text, int) from public, anon;
grant execute on function public.global_search(text, text, int) to authenticated, service_role;
