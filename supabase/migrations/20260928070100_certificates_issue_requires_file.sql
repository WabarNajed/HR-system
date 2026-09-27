-- =====================================================================================================
-- M7 Certificates — issue_certificate also requires the rendered PDF to exist in Storage
-- (certificate-files/certificates/{employee_id}/{number}.pdf), so no certificate row can point at a
-- missing file. Otherwise identical to 20260928070000. Idempotent (create or replace).
-- =====================================================================================================

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
  -- the PDF must already be stored (the server action renders and uploads it first)
  if not exists (select 1 from storage.objects o where o.bucket_id = 'certificate-files' and o.name = v_path) then
    raise exception 'hr:errors.validation' using detail = 'file';
  end if;

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

revoke execute on function public.issue_certificate(text, uuid, uuid, uuid, int, text, text, text) from public, anon;
grant execute on function public.issue_certificate(text, uuid, uuid, uuid, int, text, text, text) to authenticated, service_role;
