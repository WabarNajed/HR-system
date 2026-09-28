-- =====================================================================================================
-- Auth fix — portal-branded self-service account e-mails + confirmed admin invitations
--
-- 1. New bilingual e-mail template `registration_confirm` (Arabic-first): the self-registration
--    "confirm your e-mail" message is now rendered by the portal (src/lib/auth/provisioning.ts,
--    `registerSelfService`) in the applicant's language instead of GoTrue's English default. The
--    self-service password reset reuses the existing `password_reset` template.
--    `private.seed_defaults()` (re-run by `reset_organization`) seeds it too.
-- 2. Admin-invited accounts are now created with a confirmed e-mail (docs/DATABASE.md §15). With
--    GoTrue e-mail confirmations off (`mailer_autoconfirm`), a public sign-up for an unconfirmed
--    invited address returned a session for that ACTIVE account without any password. Existing
--    unconfirmed invited accounts are confirmed here; their outstanding invitation links keep working.
-- Idempotent.
-- =====================================================================================================

-- ─── 1. registration_confirm template ────────────────────────────────────────────────────────────

create or replace function private.seed_auth_email_templates()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.email_templates (key, name_ar, name_en, subject_ar, subject_en, body_ar, body_en, placeholders)
  values
    ('registration_confirm', 'تأكيد البريد الإلكتروني للتسجيل', 'Registration email confirmation',
     'تأكيد بريدك الإلكتروني – {{portal_name}}', 'Confirm your email for {{portal_name}}',
     $html$<p>مرحبًا {{recipient_name}}،</p><p>شكرًا لتسجيلك في <strong>{{portal_name}}</strong>. لإكمال التسجيل، يُرجى تأكيد بريدك الإلكتروني بالضغط على الزر التالي:</p><p><a href="{{link}}" class="button">تأكيد البريد الإلكتروني</a></p><p>بعد التأكيد سيراجع فريق الموارد البشرية في {{company_name}} طلب التسجيل، وستصلك رسالة عند اعتماده.</p><p>الرابط صالح لفترة محدودة. إذا لم تقم بالتسجيل، يمكنك تجاهل هذه الرسالة بأمان.</p>$html$,
     $html$<p>Hello {{recipient_name}},</p><p>Thank you for registering with <strong>{{portal_name}}</strong>. To complete your registration, please confirm your email address using the button below:</p><p><a href="{{link}}" class="button">Confirm email</a></p><p>Once confirmed, the {{company_name}} HR team will review your registration and you will receive an email when it is approved.</p><p>This link is valid for a limited time. If you did not register, you can safely ignore this email.</p>$html$,
     '["recipient_name", "company_name", "portal_name", "link"]'::jsonb)
  on conflict (key) do nothing;
end;
$$;

revoke execute on function private.seed_auth_email_templates() from public, anon, authenticated;

-- Same body as 20260927001400_seed_apply_and_grants.sql plus the auth templates above.
create or replace function private.seed_defaults()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_organization();
  perform private.seed_leave_types();
  perform private.seed_request_types();
  perform private.seed_certificate_templates();
  perform private.seed_email_templates();
  perform private.seed_auth_email_templates();
  perform private.seed_notification_settings();
end;
$$;

revoke execute on function private.seed_defaults() from public, anon, authenticated;

-- seeds are system changes: keep them out of the audit trail
do $$
begin
  perform set_config('hr.suppress_audit', 'on', true);
  perform private.seed_auth_email_templates();
  perform set_config('hr.suppress_audit', 'off', true);
end;
$$;

-- ─── 2. confirm admin-invited accounts ───────────────────────────────────────────────────────────

update auth.users
set email_confirmed_at = now()
where email_confirmed_at is null
  and coalesce(raw_app_meta_data ->> 'invited_by_admin', 'false') = 'true';
