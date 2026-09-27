-- =====================================================================================================
-- M7 Certificates — template drafts/publishing, template management RPCs, certificate issuing/revoking.
--
-- Template lifecycle (docs/DATABASE.md §7 addendum):
--   * certificate_templates holds the WORKING COPY. Every save creates a certificate_template_versions
--     snapshot (current_version = latest snapshot).
--   * published_version (new) is the version used to issue certificates. Publishing sets it to
--     current_version; saving after publishing leaves "unpublished changes" (current > published).
--   * Restore copies an old snapshot into the working copy as a NEW version (never rewrites history).
--
-- RPCs (security definer, explicit checks, errors 'hr:errors.<key>'):
--   create_certificate_template(p_data jsonb, p_change_notes text) → uuid
--   save_certificate_template(p_template_id uuid, p_data jsonb, p_change_notes text, p_expected_version int) → int
--   publish_certificate_template_draft(p_template_id uuid) → int
--   restore_certificate_template_draft(p_template_id uuid, p_version int, p_change_notes text) → int
--   set_certificate_template_active(p_template_id uuid, p_active boolean) → void
--   set_default_certificate_template(p_template_id uuid) → void
--   issue_certificate(p_certificate_number text, p_request_id uuid, p_employee_id uuid, p_template_id uuid,
--                     p_template_version int, p_language text, p_addressed_to text, p_purpose text) → uuid
--   revoke_certificate(p_certificate_id uuid, p_reason text) → void
-- Idempotent: safe to re-run.
-- =====================================================================================================

alter table public.certificate_templates add column if not exists published_version int;
comment on column public.certificate_templates.published_version is
  'Version (certificate_template_versions.version) used when issuing certificates. NULL = never published (draft).';

-- Existing (seeded) templates were published as their current version.
update public.certificate_templates
set published_version = current_version
where published_version is null and published_at is not null;

-- ---------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------
create or replace function private.certificate_template_snapshot(p_tpl public.certificate_templates)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(p_tpl) - array['id', 'key', 'created_at', 'updated_at', 'created_by', 'updated_by',
                                  'current_version', 'published_at', 'published_version', 'is_active', 'is_default']
$$;

create or replace function private.certificate_template_key(p_type text, p_variant text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_key  text;
  v_n    int := 1;
begin
  v_base := left(regexp_replace(lower(coalesce(p_type, 'custom') || '_' || coalesce(nullif(btrim(p_variant), ''), 'general')),
                                '[^a-z0-9_]+', '_', 'g'), 50);
  v_base := regexp_replace(v_base, '_+$', '');
  if v_base !~ '^[a-z]' then
    v_base := 'tpl_' || v_base;
  end if;
  v_key := v_base;
  while exists (select 1 from public.certificate_templates t where t.key = v_key) loop
    v_n := v_n + 1;
    v_key := v_base || '_' || v_n;
  end loop;
  return v_key;
end;
$$;

-- Validates the editable template fields in p_data (NULL keys keep the current value on save).
create or replace function private.certificate_template_validate(p_data jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_data ? 'certificate_type' and (p_data ->> 'certificate_type') not in ('salary', 'employment', 'salary_employment', 'experience', 'custom') then
    raise exception 'hr:errors.validation' using detail = 'certificate_type';
  end if;
  if p_data ? 'language' and (p_data ->> 'language') not in ('ar', 'en', 'bilingual') then
    raise exception 'hr:errors.validation' using detail = 'language';
  end if;
  if p_data ? 'name_ar' and (private.nullif_blank(p_data ->> 'name_ar') is null or length(p_data ->> 'name_ar') > 150) then
    raise exception 'hr:errors.validation' using detail = 'name_ar';
  end if;
  if p_data ? 'name_en' and (private.nullif_blank(p_data ->> 'name_en') is null or length(p_data ->> 'name_en') > 150) then
    raise exception 'hr:errors.validation' using detail = 'name_en';
  end if;
  if p_data ? 'variant' and (private.nullif_blank(p_data ->> 'variant') is null or length(p_data ->> 'variant') > 60) then
    raise exception 'hr:errors.validation' using detail = 'variant';
  end if;
  if coalesce(length(p_data ->> 'content_ar'), 0) > 200000 or coalesce(length(p_data ->> 'content_en'), 0) > 200000
     or coalesce(length(p_data ->> 'header_html'), 0) > 50000 or coalesce(length(p_data ->> 'footer_html'), 0) > 50000 then
    raise exception 'hr:errors.validation' using detail = 'content';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- create_certificate_template: new (inactive, unpublished) template + version 1 snapshot
-- ---------------------------------------------------------------------------------------------------
create or replace function public.create_certificate_template(p_data jsonb, p_change_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.certificate_templates;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'hr:errors.validation' using detail = 'data';
  end if;
  if not (p_data ? 'name_ar' and p_data ? 'name_en' and p_data ? 'certificate_type') then
    raise exception 'hr:errors.validation' using detail = 'name_ar';
  end if;
  perform private.certificate_template_validate(p_data);

  insert into public.certificate_templates (
    key, certificate_type, variant, name_ar, name_en, language, content_ar, content_en, header_html, footer_html,
    show_logo, show_stamp, show_signature, show_qr, is_active, is_default, current_version, published_at, published_version)
  values (
    private.certificate_template_key(p_data ->> 'certificate_type', p_data ->> 'variant'),
    p_data ->> 'certificate_type',
    coalesce(private.nullif_blank(p_data ->> 'variant'), 'general'),
    btrim(p_data ->> 'name_ar'),
    btrim(p_data ->> 'name_en'),
    coalesce(p_data ->> 'language', 'bilingual'),
    p_data ->> 'content_ar',
    p_data ->> 'content_en',
    p_data ->> 'header_html',
    p_data ->> 'footer_html',
    coalesce((p_data ->> 'show_logo')::boolean, true),
    coalesce((p_data ->> 'show_stamp')::boolean, true),
    coalesce((p_data ->> 'show_signature')::boolean, true),
    coalesce((p_data ->> 'show_qr')::boolean, true),
    false, false, 1, null, null)
  returning * into v_tpl;

  insert into public.certificate_template_versions (template_id, version, snapshot, change_notes, changed_by)
  values (v_tpl.id, 1, private.certificate_template_snapshot(v_tpl), left(private.nullif_blank(p_change_notes), 500), auth.uid());

  return v_tpl.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- save_certificate_template: update the working copy + new version snapshot (change notes required)
-- p_expected_version guards against overwriting someone else's save (errors.conflict).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_certificate_template(
  p_template_id uuid,
  p_data jsonb,
  p_change_notes text,
  p_expected_version int default null
)
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
  if private.nullif_blank(p_change_notes) is null then
    raise exception 'hr:errors.changeNotesRequired' using detail = 'change_notes';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'hr:errors.validation' using detail = 'data';
  end if;
  perform private.certificate_template_validate(p_data);

  select * into v_tpl from public.certificate_templates where id = p_template_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if p_expected_version is not null and v_tpl.current_version <> p_expected_version then
    raise exception 'hr:errors.conflict' using errcode = '40001';
  end if;

  v_version := coalesce((select max(v.version) from public.certificate_template_versions v where v.template_id = p_template_id), 0) + 1;

  update public.certificate_templates t
  set certificate_type = coalesce(p_data ->> 'certificate_type', t.certificate_type),
      variant          = coalesce(private.nullif_blank(p_data ->> 'variant'), t.variant),
      name_ar          = coalesce(btrim(p_data ->> 'name_ar'), t.name_ar),
      name_en          = coalesce(btrim(p_data ->> 'name_en'), t.name_en),
      language         = coalesce(p_data ->> 'language', t.language),
      content_ar       = case when p_data ? 'content_ar' then p_data ->> 'content_ar' else t.content_ar end,
      content_en       = case when p_data ? 'content_en' then p_data ->> 'content_en' else t.content_en end,
      header_html      = case when p_data ? 'header_html' then p_data ->> 'header_html' else t.header_html end,
      footer_html      = case when p_data ? 'footer_html' then p_data ->> 'footer_html' else t.footer_html end,
      show_logo        = coalesce((p_data ->> 'show_logo')::boolean, t.show_logo),
      show_stamp       = coalesce((p_data ->> 'show_stamp')::boolean, t.show_stamp),
      show_signature   = coalesce((p_data ->> 'show_signature')::boolean, t.show_signature),
      show_qr          = coalesce((p_data ->> 'show_qr')::boolean, t.show_qr),
      -- a default must match its type; changing the type drops the default flag
      is_default       = t.is_default and coalesce(p_data ->> 'certificate_type', t.certificate_type) = t.certificate_type,
      current_version  = v_version
  where t.id = p_template_id
  returning * into v_tpl;

  insert into public.certificate_template_versions (template_id, version, snapshot, change_notes, changed_by)
  values (p_template_id, v_version, private.certificate_template_snapshot(v_tpl), left(btrim(p_change_notes), 500), auth.uid());

  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- publish_certificate_template_draft: the current version becomes the issuing version (and active)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.publish_certificate_template_draft(p_template_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.certificate_templates;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_tpl from public.certificate_templates where id = p_template_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.certificate_template_versions v
                 where v.template_id = p_template_id and v.version = v_tpl.current_version) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;

  update public.certificate_templates t
  set published_version = t.current_version,
      published_at = now(),
      is_active = true,
      -- first active template of its type becomes the default automatically
      is_default = t.is_default or not exists (
        select 1 from public.certificate_templates o
        where o.certificate_type = t.certificate_type and o.id <> t.id and o.is_default and o.is_active)
  where t.id = p_template_id
  returning * into v_tpl;

  perform private.write_audit('certificate_template.publish', 'certificate_template', p_template_id::text,
                              coalesce(v_tpl.name_en, v_tpl.name_ar),
                              jsonb_build_object('version', v_tpl.published_version));
  return v_tpl.published_version;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- restore_certificate_template_draft: copy an old snapshot into the working copy as a NEW version
-- (not published — publish explicitly). Type/variant/key/flags are kept.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.restore_certificate_template_draft(p_template_id uuid, p_version int, p_change_notes text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snap    jsonb;
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
  select v.snapshot into v_snap from public.certificate_template_versions v where v.template_id = p_template_id and v.version = p_version;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;

  v_version := coalesce((select max(v.version) from public.certificate_template_versions v where v.template_id = p_template_id), 0) + 1;

  update public.certificate_templates t
  set name_ar        = coalesce(private.nullif_blank(v_snap ->> 'name_ar'), t.name_ar),
      name_en        = coalesce(private.nullif_blank(v_snap ->> 'name_en'), t.name_en),
      language       = coalesce(v_snap ->> 'language', t.language),
      content_ar     = v_snap ->> 'content_ar',
      content_en     = v_snap ->> 'content_en',
      header_html    = v_snap ->> 'header_html',
      footer_html    = v_snap ->> 'footer_html',
      show_logo      = coalesce((v_snap ->> 'show_logo')::boolean, t.show_logo),
      show_stamp     = coalesce((v_snap ->> 'show_stamp')::boolean, t.show_stamp),
      show_signature = coalesce((v_snap ->> 'show_signature')::boolean, t.show_signature),
      show_qr        = coalesce((v_snap ->> 'show_qr')::boolean, t.show_qr),
      current_version = v_version
  where t.id = p_template_id
  returning * into v_tpl;

  insert into public.certificate_template_versions (template_id, version, snapshot, change_notes, changed_by)
  values (p_template_id, v_version, private.certificate_template_snapshot(v_tpl),
          left(coalesce(private.nullif_blank(p_change_notes), 'Restored from version ' || p_version), 500), auth.uid());

  perform private.write_audit('certificate_template.restore', 'certificate_template', p_template_id::text,
                              coalesce(v_tpl.name_en, v_tpl.name_ar),
                              jsonb_build_object('restored_version', p_version, 'new_version', v_version));
  return v_version;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Activation and default template per certificate type
-- ---------------------------------------------------------------------------------------------------
create or replace function public.set_certificate_template_active(p_template_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.certificate_templates;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_tpl from public.certificate_templates where id = p_template_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if coalesce(p_active, false) and v_tpl.published_version is null then
    raise exception 'hr:errors.templateNotPublished';
  end if;
  update public.certificate_templates
  set is_active = coalesce(p_active, false),
      is_default = case when coalesce(p_active, false) then is_default else false end
  where id = p_template_id;
end;
$$;

create or replace function public.set_default_certificate_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl public.certificate_templates;
begin
  if not private.has_org_permission('settings', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_tpl from public.certificate_templates where id = p_template_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if not v_tpl.is_active or v_tpl.published_version is null then
    raise exception 'hr:errors.templateNotPublished';
  end if;
  update public.certificate_templates
  set is_default = (id = p_template_id)
  where certificate_type = v_tpl.certificate_type and (is_default or id = p_template_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- issue_certificate: records an issued certificate (the PDF was rendered and uploaded by the server
-- action under certificates/{employee_id}/{number}.pdf). The number comes from
-- next_document_number('CERT'). Insert → audit (row trigger) + certificate_issued notification
-- (trigger) + request history entry, in one transaction.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.issue_certificate(
  p_certificate_number text,
  p_request_id uuid,
  p_employee_id uuid,
  p_template_id uuid,
  p_template_version int,
  p_language text,
  p_addressed_to text default null,
  p_purpose text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl    public.certificate_templates;
  v_req    public.hr_requests;
  v_type   text;
  v_id     uuid;
  v_path   text;
  v_number text := upper(btrim(p_certificate_number));
begin
  if not private.has_org_permission('certificates', 'create') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if v_number is null or v_number !~ '^CERT-[0-9]{4}-[0-9]{6,}$' then
    raise exception 'hr:errors.validation' using detail = 'certificate_number';
  end if;
  if p_language is null or p_language not in ('ar', 'en', 'bilingual') then
    raise exception 'hr:errors.validation' using detail = 'language';
  end if;
  if not exists (select 1 from public.employees e where e.id = p_employee_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;

  select * into v_tpl from public.certificate_templates where id = p_template_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if not v_tpl.is_active or v_tpl.published_version is null or v_tpl.published_version <> p_template_version then
    raise exception 'hr:errors.templateNotPublished';
  end if;
  if not (v_tpl.language = 'bilingual' or v_tpl.language = p_language) then
    raise exception 'hr:errors.templateLanguageMismatch' using detail = 'language';
  end if;

  if p_request_id is not null then
    select * into v_req from public.hr_requests where id = p_request_id for update;
    if not found then
      raise exception 'hr:errors.notFound' using errcode = 'P0002';
    end if;
    select rt.key into v_type from public.request_types rt where rt.id = v_req.request_type_id;
    if v_type is distinct from 'certificate' or v_req.employee_id is distinct from p_employee_id then
      raise exception 'hr:errors.validation' using detail = 'request_id';
    end if;
    if v_req.status not in ('pending_hr_review', 'approved', 'in_progress', 'completed') then
      raise exception 'hr:errors.invalidTransition';
    end if;
  end if;

  v_path := 'certificates/' || p_employee_id::text || '/' || v_number || '.pdf';

  insert into public.certificates (certificate_number, employee_id, request_id, template_id, template_version, certificate_type,
                                   language, addressed_to, purpose, issue_date, status, storage_path, issued_by)
  values (v_number, p_employee_id, p_request_id, p_template_id, p_template_version, v_tpl.certificate_type,
          p_language, left(private.nullif_blank(p_addressed_to), 200), left(private.nullif_blank(p_purpose), 300),
          private.org_today(), 'valid', v_path, auth.uid())
  returning id into v_id;

  if p_request_id is not null then
    insert into public.request_history (request_id, action, from_status, to_status, actor_id, actor_name, note, metadata)
    values (p_request_id, 'certificate_issued', v_req.status, v_req.status, auth.uid(), private.profile_display_name(auth.uid()),
            v_number, jsonb_build_object('certificate_id', v_id, 'certificate_number', v_number,
                                         'certificate_type', v_tpl.certificate_type, 'language', p_language));
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- revoke_certificate: final; reason required. Row trigger stamps revoked_at and audits the change.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.revoke_certificate(p_certificate_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cert public.certificates;
begin
  if not (private.has_org_permission('certificates', 'edit') or private.has_org_permission('certificates', 'create')) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if private.nullif_blank(p_reason) is null then
    raise exception 'hr:errors.reasonRequired' using detail = 'reason';
  end if;
  select * into v_cert from public.certificates where id = p_certificate_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_cert.status <> 'valid' then
    raise exception 'hr:errors.invalidTransition';
  end if;
  update public.certificates
  set status = 'revoked', revoked_at = now(), revoke_reason = left(btrim(p_reason), 500)
  where id = p_certificate_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privileges: authenticated only (never anon); private helpers stay internal.
-- ---------------------------------------------------------------------------------------------------
revoke execute on function public.create_certificate_template(jsonb, text) from public, anon;
revoke execute on function public.save_certificate_template(uuid, jsonb, text, int) from public, anon;
revoke execute on function public.publish_certificate_template_draft(uuid) from public, anon;
revoke execute on function public.restore_certificate_template_draft(uuid, int, text) from public, anon;
revoke execute on function public.set_certificate_template_active(uuid, boolean) from public, anon;
revoke execute on function public.set_default_certificate_template(uuid) from public, anon;
revoke execute on function public.issue_certificate(text, uuid, uuid, uuid, int, text, text, text) from public, anon;
revoke execute on function public.revoke_certificate(uuid, text) from public, anon;

grant execute on function public.create_certificate_template(jsonb, text) to authenticated, service_role;
grant execute on function public.save_certificate_template(uuid, jsonb, text, int) to authenticated, service_role;
grant execute on function public.publish_certificate_template_draft(uuid) to authenticated, service_role;
grant execute on function public.restore_certificate_template_draft(uuid, int, text) to authenticated, service_role;
grant execute on function public.set_certificate_template_active(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_default_certificate_template(uuid) to authenticated, service_role;
grant execute on function public.issue_certificate(text, uuid, uuid, uuid, int, text, text, text) to authenticated, service_role;
grant execute on function public.revoke_certificate(uuid, text) to authenticated, service_role;

revoke all on function private.certificate_template_snapshot(public.certificate_templates) from public, anon, authenticated;
revoke all on function private.certificate_template_key(text, text) from public, anon, authenticated;
revoke all on function private.certificate_template_validate(jsonb) from public, anon, authenticated;
grant execute on function private.certificate_template_snapshot(public.certificate_templates) to service_role;
grant execute on function private.certificate_template_key(text, text) to service_role;
grant execute on function private.certificate_template_validate(jsonb) to service_role;
