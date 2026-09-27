-- =====================================================================================================
-- HR Portal — Storage buckets and storage.objects policies (ARCHITECTURE.md §7 Storage)
--   employee-documents  {employee_id}/{document_id}/{file} · avatars {employee_id}/avatar/{file}   private
--   request-attachments requests/{request_id}/{uuid}-{file}                                        private
--   certificate-files   certificates/{employee_id}/{certificate_number}.pdf · branding/stamp.* · branding/signature.*
--   branding            logo/* · login/*                                                           PUBLIC
-- Reads of private files go through short-lived signed URLs created with the user's client, so the
-- SELECT policies below are the access check.
-- =====================================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('employee-documents', 'employee-documents', false, 20971520, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('request-attachments', 'request-attachments', false, 20971520, array[
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('certificate-files', 'certificate-files', false, 20971520, array[
    'application/pdf', 'image/png', 'image/jpeg', 'image/webp']),
  ('branding', 'branding', true, 5242880, array[
    'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------------------------------
-- Path-based access helpers
-- ---------------------------------------------------------------------------------------------------
create or replace function private.can_read_employee_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_emp   uuid := private.try_uuid(v_parts[1]);
  v_doc   uuid := private.try_uuid(v_parts[2]);
begin
  if v_emp is null or not private.is_active_user() then
    return false;
  end if;
  if v_parts[2] = 'avatar' then
    return private.can_view_employee(v_emp);
  end if;
  if private.has_org_permission('documents', 'view') then
    return true;
  end if;
  if v_emp = private.current_employee_id() and v_doc is not null then
    return exists (
      select 1 from public.employee_documents d
      where d.id = v_doc and d.employee_id = v_emp
        and (not d.is_confidential or d.uploaded_by = auth.uid())
    );
  end if;
  return false;
end;
$$;

create or replace function private.can_write_employee_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
  v_emp   uuid := private.try_uuid(v_parts[1]);
  v_doc   uuid := private.try_uuid(v_parts[2]);
begin
  if v_emp is null or not private.is_active_user() then
    return false;
  end if;
  if v_parts[2] = 'avatar' then
    return private.has_org_permission('employees', 'edit');
  end if;
  if v_doc is null then
    return false;
  end if;
  if private.has_org_permission('documents', 'create') or private.has_org_permission('documents', 'edit') then
    return true;
  end if;
  -- owner uploads: the document row (status pending_review, uploaded by the caller) must exist first
  return v_emp = private.current_employee_id() and exists (
    select 1 from public.employee_documents d
    where d.id = v_doc and d.employee_id = v_emp and d.uploaded_by = auth.uid() and d.status = 'pending_review'
  );
end;
$$;

create or replace function private.can_read_certificate_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if not private.is_active_user() then
    return false;
  end if;
  if v_parts[1] = 'certificates' then
    return private.has_org_permission('certificates', 'view')
      or (private.try_uuid(v_parts[2]) = private.current_employee_id()
          and exists (select 1 from public.certificates c
                      where c.employee_id = private.current_employee_id() and c.storage_path = p_name and c.status = 'valid'));
  end if;
  if v_parts[1] = 'branding' then
    return private.has_org_permission('certificates', 'view') or private.has_org_permission('settings', 'view');
  end if;
  return false;
end;
$$;

create or replace function private.can_write_certificate_file(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if v_parts[1] = 'certificates' then
    return private.try_uuid(v_parts[2]) is not null and private.has_org_permission('certificates', 'create');
  end if;
  if v_parts[1] = 'branding' then
    return private.has_org_permission('settings', 'edit');
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Policies (names prefixed hr_ to avoid clashes with other policies on storage.objects)
-- ---------------------------------------------------------------------------------------------------
drop policy if exists hr_employee_documents_select on storage.objects;
create policy hr_employee_documents_select on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents' and private.can_read_employee_file(name));
drop policy if exists hr_employee_documents_insert on storage.objects;
create policy hr_employee_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents' and private.can_write_employee_file(name));
drop policy if exists hr_employee_documents_update on storage.objects;
create policy hr_employee_documents_update on storage.objects for update to authenticated
  using (bucket_id = 'employee-documents' and private.can_write_employee_file(name))
  with check (bucket_id = 'employee-documents' and private.can_write_employee_file(name));
drop policy if exists hr_employee_documents_delete on storage.objects;
create policy hr_employee_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents' and private.can_write_employee_file(name));

drop policy if exists hr_request_attachments_select on storage.objects;
create policy hr_request_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'request-attachments'
         and (storage.foldername(name))[1] = 'requests'
         and private.can_view_request(private.try_uuid((storage.foldername(name))[2])));
drop policy if exists hr_request_attachments_insert on storage.objects;
create policy hr_request_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'request-attachments'
              and (storage.foldername(name))[1] = 'requests'
              and private.can_attach_to_request(private.try_uuid((storage.foldername(name))[2])));
drop policy if exists hr_request_attachments_delete on storage.objects;
create policy hr_request_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'request-attachments'
         and (storage.foldername(name))[1] = 'requests'
         and private.can_attach_to_request(private.try_uuid((storage.foldername(name))[2])));

drop policy if exists hr_certificate_files_select on storage.objects;
create policy hr_certificate_files_select on storage.objects for select to authenticated
  using (bucket_id = 'certificate-files' and private.can_read_certificate_file(name));
drop policy if exists hr_certificate_files_insert on storage.objects;
create policy hr_certificate_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificate-files' and private.can_write_certificate_file(name));
drop policy if exists hr_certificate_files_update on storage.objects;
create policy hr_certificate_files_update on storage.objects for update to authenticated
  using (bucket_id = 'certificate-files' and private.can_write_certificate_file(name))
  with check (bucket_id = 'certificate-files' and private.can_write_certificate_file(name));
drop policy if exists hr_certificate_files_delete on storage.objects;
create policy hr_certificate_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'certificate-files' and private.can_write_certificate_file(name));

drop policy if exists hr_branding_select on storage.objects;
create policy hr_branding_select on storage.objects for select to public
  using (bucket_id = 'branding');
drop policy if exists hr_branding_insert on storage.objects;
create policy hr_branding_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and (private.is_super_admin() or private.has_org_permission('settings', 'administer')));
drop policy if exists hr_branding_update on storage.objects;
create policy hr_branding_update on storage.objects for update to authenticated
  using (bucket_id = 'branding' and (private.is_super_admin() or private.has_org_permission('settings', 'administer')))
  with check (bucket_id = 'branding' and (private.is_super_admin() or private.has_org_permission('settings', 'administer')));
drop policy if exists hr_branding_delete on storage.objects;
create policy hr_branding_delete on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and (private.is_super_admin() or private.has_org_permission('settings', 'administer')));
