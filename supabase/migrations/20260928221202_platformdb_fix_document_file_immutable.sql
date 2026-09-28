-- =====================================================================================================
-- Platform DB fix — the file of an employee document can no longer be overwritten or deleted in place.
--
-- Before: private.can_write_employee_file() was the check for INSERT, UPDATE and DELETE on
-- employee-documents/<employee>/<document>/<file>, and it let every documents.create / documents.edit
-- holder write ANY such object. An HR user could therefore upsert different content over the file of a
-- reviewed (valid / expired / rejected / archived) document, or delete it, through the Storage API —
-- with no audit event and the row still claiming the old review.
--
-- After (same rule the certificates fix 20260928210701 applies to issued certificate PDFs):
--   * INSERT is unchanged: a NEW object only (a plain insert on an existing name is a duplicate error;
--     an upsert takes the UPDATE path below). This is the first upload after the row was created.
--   * UPDATE (upsert over an existing object, move) and DELETE use private.can_modify_employee_file():
--       - an object that NO employee_documents row references (superseded file after a replace, an
--         uploaded-but-uncommitted replacement, an orphan, an avatar): as before (can_write_employee_file);
--       - an object a row references: only the row's own uploader, for their own employee record, while
--         the row is pending_review (retry / withdrawal of a self-service submission). Nobody else — HR
--         included — may change or remove it, whatever the status.
--     A file is replaced only through the audited replace flow (upload a new path, point the row at it,
--     then remove the now-unreferenced old object) or by deleting the row first and then the file.
--   * The UPDATE policy evaluates the check for the old (USING) and the new (WITH CHECK) name, so a
--     move away from — or onto — a referenced path is refused too.
-- Idempotent.
-- =====================================================================================================

create or replace function private.can_modify_employee_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc record;
begin
  if not private.can_write_employee_file(p_name) then
    return false;
  end if;
  select d.id, d.employee_id, d.status, d.uploaded_by
    into v_doc
    from public.employee_documents d
   where d.storage_path = p_name;   -- unique (employee_documents_storage_path_key)
  if not found then
    return true;
  end if;
  return v_doc.status = 'pending_review'
     and v_doc.uploaded_by = auth.uid()
     and v_doc.employee_id = private.current_employee_id();
end;
$$;

revoke execute on function private.can_modify_employee_file(text) from public, anon;
grant execute on function private.can_modify_employee_file(text) to authenticated;

comment on function private.can_modify_employee_file(text) is
  'Storage UPDATE / DELETE check for employee-documents: can_write_employee_file() and, when an employee_documents '
  'row references the path, only that row''s uploader for their own record while it is pending_review. Files of '
  'reviewed documents are immutable (replace = new path + row update; delete = row first, then the file).';

drop policy if exists hr_employee_documents_update on storage.objects;
create policy hr_employee_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-documents' and private.can_modify_employee_file(name))
  with check (bucket_id = 'employee-documents' and private.can_modify_employee_file(name));

drop policy if exists hr_employee_documents_delete on storage.objects;
create policy hr_employee_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents' and private.can_modify_employee_file(name));
