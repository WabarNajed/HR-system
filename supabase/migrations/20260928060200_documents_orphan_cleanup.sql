-- =====================================================================================================
-- M6 — Documents: interrupted uploads
--
-- An upload creates the employee_documents row first (the storage policy for employee self-uploads
-- needs it), then the browser sends the file. When the tab is closed mid-upload, the row stays behind
-- without a file. The daily cron (GET /api/cron/expiry-alerts) removes such rows once they are a day
-- old — only rows nobody touched after creating them (never reviewed or edited), so a document whose
-- file went missing later is never deleted silently.
-- Idempotent (create or replace).
-- =====================================================================================================

create or replace function public.cleanup_orphan_employee_documents(p_min_age interval default interval '1 day')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not private.is_super_admin() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  with gone as (
    delete from public.employee_documents d
     where d.storage_path is not null
       and d.created_at < now() - greatest(coalesce(p_min_age, interval '1 day'), interval '1 hour')
       and d.updated_at <= d.created_at + interval '1 minute'
       and not exists (
         select 1 from storage.objects o
          where o.bucket_id = 'employee-documents' and o.name = d.storage_path
       )
    returning 1
  )
  select count(*) into v_count from gone;
  return v_count;
end;
$$;

comment on function public.cleanup_orphan_employee_documents(interval) is
  'Deletes employee_documents rows whose upload never completed (no storage object, never edited, older than p_min_age ≥ 1 hour). Service role (daily cron) or super admin.';

revoke execute on function public.cleanup_orphan_employee_documents(interval) from public, anon;
grant execute on function public.cleanup_orphan_employee_documents(interval) to authenticated, service_role;
