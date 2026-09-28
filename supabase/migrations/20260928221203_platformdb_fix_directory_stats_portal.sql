-- =====================================================================================================
-- Platform DB fix — "Without portal access" on /employees is right for managers again.
--
-- Before: public.employee_directory_stats() (SECURITY INVOKER) decided `without_portal` with
-- `exists (select 1 from public.profiles …)`. Since 20260928211202 full profiles rows are readable only
-- for the caller's own row and org viewers, so for a manager every direct report looked like it had no
-- portal account (e.g. 4 of 4 instead of 2 of 4).
--
-- After: the check reads public.profile_cards (id, full_name, employee_id, status), which shows a
-- manager their direct reports' cards and org viewers every card — exactly the employees this function
-- counts (org-wide for org viewers, `manager_id = p_manager_id` otherwise). Same signature, same
-- SECURITY INVOKER / RLS behaviour, same jsonb keys. Idempotent (create or replace; grants restated).
-- =====================================================================================================

create or replace function public.employee_directory_stats(p_manager_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.org_today();
  v_result jsonb;
begin
  -- aggregates without GROUP BY always return exactly one row (zeros for an empty directory)
  select jsonb_build_object(
    'total', count(*) filter (where e.archived_at is null),
    'active', count(*) filter (where e.archived_at is null and e.employment_status in ('active', 'probation', 'on_leave')),
    'probation', count(*) filter (where e.archived_at is null and e.employment_status = 'probation'),
    'on_leave', count(*) filter (where e.archived_at is null and e.employment_status = 'on_leave'),
    'iqama_expiring_30', count(*) filter (where e.archived_at is null and e.iqama_expiry_date - v_today between 0 and 30),
    'iqama_expired', count(*) filter (where e.archived_at is null and e.iqama_expiry_date - v_today < 0),
    'without_portal', count(*) filter (where e.archived_at is null
                                         and not exists (select 1 from public.profile_cards p where p.employee_id = e.id)),
    'archived', count(*) filter (where e.archived_at is not null),
    'today', v_today
  )
  into v_result
  from public.employees e
  where p_manager_id is null or e.manager_id = p_manager_id;

  return v_result;
end;
$$;

revoke all on function public.employee_directory_stats(uuid) from public, anon;
grant execute on function public.employee_directory_stats(uuid) to authenticated, service_role;
