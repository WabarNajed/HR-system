-- =====================================================================================================
-- M7 Certificates — an issued certificate's PDF is immutable in Storage.
--
-- Before: private.can_write_certificate_file() granted INSERT / UPDATE / DELETE on any
-- certificate-files/certificates/<uuid>/… object to every holder of certificates.create. An HR officer
-- could therefore overwrite (upsert) an issued certificate's PDF with altered content, or delete it, while
-- /verify kept reporting the certificate as valid. The certificates table itself is already locked
-- (20260928070200), but the file was not.
--
-- After:  certificates/<employee uuid>/<file> may be written (insert, upsert, move, delete) by
-- certificates.create holders ONLY while no certificates row references that path, i.e. the pre-issue
-- upload that issue_certificate requires and the cleanup of an orphan left by a failed issue. Once a row
-- (valid or revoked) points at the object, no authenticated user can change or remove it; revocation is
-- recorded on the row. branding/* (stamp, signature) is unchanged: settings.edit.
-- The UPDATE policy evaluates the function for both the old (USING) and the new (WITH CHECK) name, so a
-- rename/move of an issued PDF is blocked too. Idempotent.
-- =====================================================================================================

-- the policy looks up certificates by storage_path on every write
create index if not exists certificates_storage_path_idx on public.certificates (storage_path);

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
  if not private.is_active_user() then
    return false;
  end if;
  if v_parts[1] = 'certificates' then
    return coalesce(array_length(v_parts, 1), 0) = 2
      and private.try_uuid(v_parts[2]) is not null
      and private.has_org_permission('certificates', 'create')
      -- issued (valid or revoked) certificate files are never overwritten, moved or deleted
      and not exists (select 1 from public.certificates c where c.storage_path = p_name);
  end if;
  if v_parts[1] = 'branding' then
    return private.has_org_permission('settings', 'edit');
  end if;
  return false;
end;
$$;

revoke execute on function private.can_write_certificate_file(text) from public, anon;
grant execute on function private.can_write_certificate_file(text) to authenticated;

comment on function private.can_write_certificate_file(text) is
  'Storage write check for certificate-files: certificates/<employee>/<file> needs certificates.create and no certificates row referencing the path (issued PDFs are immutable); branding/* needs settings.edit.';
