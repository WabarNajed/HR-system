-- =====================================================================================================
-- M1 — users & access
-- 1. Roles that still have members cannot be deleted by signed-in users (the user_roles FK cascades,
--    so a delete would silently strip every member of that access). Defense in depth for the
--    "delete custom role only when unused" rule in Settings › Roles.
-- 2. Registration information requests are e-mailed to the applicant: bilingual template
--    `registration_info_requested` + e-mail switched on for that event (only while the setting still
--    has its seeded value).
-- Idempotent.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- 1. Role deletion guard
-- ---------------------------------------------------------------------------------------------------
create or replace function private.role_member_count(p_role_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.user_roles ur where ur.role_id = p_role_id
$$;

revoke execute on function private.role_member_count(uuid) from public, anon, authenticated;

-- SECURITY INVOKER on purpose (like the other guards): current_user = 'authenticated' marks a direct
-- Data API delete; definer RPCs, the service role and reset_organization are not affected.
create or replace function private.roles_in_use_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return old;
  end if;
  if private.role_member_count(old.id) > 0 then
    raise exception 'hr:errors.inUse' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

-- role_member_count is executed by the guard as the invoking user
grant execute on function private.role_member_count(uuid) to authenticated;
revoke execute on function private.roles_in_use_guard() from public, anon;

drop trigger if exists roles_in_use_guard on public.roles;
create trigger roles_in_use_guard
  before delete on public.roles
  for each row execute function private.roles_in_use_guard();

-- ---------------------------------------------------------------------------------------------------
-- 2. Registration information request e-mail
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform set_config('hr.suppress_audit', 'on', true);

  insert into public.email_templates (key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, placeholders)
  values (
    'registration_info_requested', 'طلب معلومات إضافية للتسجيل', 'Registration information requested',
    'معلومات إضافية مطلوبة لتفعيل حسابك في {{portal_name}}', 'More information needed for your {{portal_name}} account',
    $html$<p>مرحبًا {{recipient_name}}،</p><p>راجع فريق الموارد البشرية في {{company_name}} طلب تسجيلك في <strong>{{portal_name}}</strong> ويحتاج إلى بعض المعلومات الإضافية قبل تفعيل الحساب:</p><p><strong>ملاحظة الموارد البشرية:</strong> {{note}}</p><p>يُرجى تسجيل الدخول وتحديث بياناتك، وسيُعاد طلبك تلقائيًا إلى المراجعة.</p><p><a href="{{link}}" class="button">تحديث البيانات</a></p>$html$,
    $html$<p>Hello {{recipient_name}},</p><p>The {{company_name}} HR team reviewed your <strong>{{portal_name}}</strong> registration and needs a few more details before activating your account:</p><p><strong>Note from HR:</strong> {{note}}</p><p>Please sign in and update your details — your registration will go back to review automatically.</p><p><a href="{{link}}" class="button">Update my details</a></p>$html$,
    '["recipient_name", "note", "company_name", "portal_name", "link"]'::jsonb
  )
  on conflict (key) do nothing;

  -- Only flip the seeded default (never override an administrator's choice).
  update public.notification_settings
  set email_enabled = true
  where event_key = 'registration_info_requested'
    and not email_enabled
    and updated_at = created_at;

  perform set_config('hr.suppress_audit', 'off', true);
end;
$$;
