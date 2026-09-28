-- =====================================================================================================
-- M6 — Documents: review hardening
--
--   * Reviewing an employee self-upload (approve / reject) needs org `documents.approve`. `documents.edit`
--     alone no longer implies it: the seeded HR Officer role has documents create/edit/view but not
--     approve, and the roles matrix must mean what it says.
--   * Direct Data API writes (current_user = authenticated) by callers without org `documents.approve`
--     can no longer move a document out of `pending_review` or `rejected` (e.g. pending → valid, or the
--     archive → restore detour). The review RPC (security definer, runs as the owner) is unaffected.
--   * Medical reports are always confidential (the upload form says so) — enforced for every writer,
--     including imports. Owners still see their own uploads (employee_documents_select: uploaded_by).
-- Idempotent (create or replace).
-- =====================================================================================================

create or replace function private.employee_documents_review_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document_type = 'medical_report' then
    new.is_confidential := true;
  end if;
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then
      if not private.has_org_permission('documents', 'edit') then
        new.review_note := null;
        new.reviewed_by := null;
        new.reviewed_at := null;
      elsif new.reviewed_by is not null then
        new.reviewed_by := auth.uid();
        new.reviewed_at := coalesce(new.reviewed_at, now());
      end if;
    else
      -- a pending or rejected upload only leaves its review state through a reviewer
      if old.status in ('pending_review', 'rejected')
         and new.status is distinct from old.status
         and not private.has_org_permission('documents', 'approve') then
        raise exception 'hr:errors.forbidden' using errcode = '42501';
      end if;
      if new.reviewed_by is distinct from old.reviewed_by then
        new.reviewed_by := case when new.reviewed_by is null then null else auth.uid() end;
        new.reviewed_at := case when new.reviewed_by is null then null else now() end;
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.employee_documents_review_guard() from public, anon;

create or replace function public.review_employee_document(p_document_id uuid, p_decision text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc    public.employee_documents;
  v_note   text := private.nullif_blank(p_note);
  v_status text;
begin
  if not private.has_org_permission('documents', 'approve') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'hr:errors.validation' using errcode = 'P0001', detail = 'decision';
  end if;
  select * into v_doc from public.employee_documents where id = p_document_id for update;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if v_doc.status <> 'pending_review' then
    raise exception 'hr:errors.invalidTransition' using errcode = 'P0001';
  end if;
  -- nobody reviews their own upload (super admins excepted, as for requests)
  if v_doc.employee_id = private.current_employee_id() and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'hr:errors.reasonRequired' using errcode = 'P0001', detail = 'note';
  end if;
  if v_note is not null and length(v_note) > 1000 then
    raise exception 'hr:errors.validation' using errcode = 'P0001', detail = 'note';
  end if;

  v_status := case
    when p_decision = 'reject' then 'rejected'
    when v_doc.expiry_date is not null and v_doc.expiry_date < private.org_today() then 'expired'
    else 'valid'
  end;
  update public.employee_documents
     set status = v_status, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_document_id;
  return v_status;
end;
$$;

comment on function public.review_employee_document(uuid, text, text) is
  'Approve (→ valid, or expired when past its expiry date) or reject (reason required) a pending_review employee document. Org documents.approve.';

revoke execute on function public.review_employee_document(uuid, text, text) from public, anon;
grant execute on function public.review_employee_document(uuid, text, text) to authenticated;

-- existing rows
update public.employee_documents set is_confidential = true where document_type = 'medical_report' and not is_confidential;
