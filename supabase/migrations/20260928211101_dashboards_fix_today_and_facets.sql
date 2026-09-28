-- Dashboards QA fixes (round 1): evaluate "today" once per call instead of once per row, and make
-- audit_log_facets() index-friendly.
--
-- 1. private.expiry_buckets(date[]) subtracted private.org_today() from every array element. org_today()
--    is SECURITY DEFINER with its own search_path (never inlined) and reads organization_settings, so
--    dashboard_stats() (5 bucket calls over every employee / insurance / document date) cost seconds
--    at a few thousand employees. A two-argument variant takes "today" as a parameter; the one-argument
--    signature (used by dashboard_stats) now evaluates org_today() once and delegates.
-- 2. public.employee_directory_stats(uuid) computed `iqama_expiry_date - private.org_today()` per row
--    → plpgsql with `today` in a variable (same result shape, same security-invoker / RLS behaviour).
-- 3. public.audit_log_facets(timestamptz) was a non-inlinable SQL function whose generic
--    `p_since is null or created_at >= p_since` predicate could never use audit_logs_created_at_idx:
--    three full scans on every audit-log page view and dashboard audit widget. It is now plpgsql with a
--    dedicated path per case: a windowed path (index range scan, one pass shared by the three facets)
--    and an unfiltered path that aggregates straight off the (action), (entity_type, …) and
--    (actor_id, …) indexes (index-only scans), resolving each actor's e-mail from its latest row.
--    `plan_cache_mode = force_custom_plan` keeps the windowed query planned for the actual bound.
-- Idempotent (create or replace); grants are restated explicitly. No security changes: all three
-- functions stay SECURITY INVOKER, so RLS (audit.view, employee visibility) still applies.

-- 1 ─ expiry buckets ─────────────────────────────────────────────────────────────────────────────

create or replace function private.expiry_buckets(p_dates date[], p_today date)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'expired', count(*) filter (where d.n < 0),
    'within7', count(*) filter (where d.n between 0 and 7),
    'within14', count(*) filter (where d.n between 8 and 14),
    'within30', count(*) filter (where d.n between 15 and 30),
    'within60', count(*) filter (where d.n between 31 and 60),
    'within90', count(*) filter (where d.n between 61 and 90)
  )
  from (select x - p_today as n from unnest(p_dates) as x where x is not null) as d
$$;

create or replace function private.expiry_buckets(p_dates date[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- org_today() is evaluated once here (a function argument), never per array element.
  select private.expiry_buckets(p_dates, private.org_today())
$$;

revoke all on function private.expiry_buckets(date[], date) from public, anon;
revoke all on function private.expiry_buckets(date[]) from public, anon;
grant execute on function private.expiry_buckets(date[], date) to authenticated, service_role;
grant execute on function private.expiry_buckets(date[]) to authenticated, service_role;

-- 2 ─ employee directory stats ───────────────────────────────────────────────────────────────────

create or replace function public.employee_directory_stats(p_manager_id uuid default null)
returns jsonb
language plpgsql
stable
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
                                         and not exists (select 1 from public.profiles p where p.employee_id = e.id)),
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

-- 3 ─ audit log facets ───────────────────────────────────────────────────────────────────────────

create or replace function public.audit_log_facets(p_since timestamptz default null)
returns table (facet text, value text, label text, total bigint)
language plpgsql
stable
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  if p_since is not null then
    -- One index range scan on created_at, shared by the three facets.
    return query
      with w as materialized (
        select a.action, a.entity_type, a.actor_id, a.actor_email
        from public.audit_logs a
        where a.created_at >= p_since
      )
      select 'action'::text, w.action, null::text, count(*) from w group by w.action
      union all
      select 'entity_type'::text, w.entity_type, null::text, count(*) from w where w.entity_type is not null group by w.entity_type
      union all
      select 'actor'::text, w.actor_id::text, max(w.actor_email), count(*) from w where w.actor_id is not null group by w.actor_id;
    return;
  end if;

  -- Whole log: each facet aggregates off its own index (index-only scans); the actor label is the
  -- e-mail recorded on that actor's latest event (actor_id, created_at desc index).
  return query
    select 'action'::text, a.action, null::text, count(*) from public.audit_logs a group by a.action
    union all
    select 'entity_type'::text, a.entity_type, null::text, count(*) from public.audit_logs a
      where a.entity_type is not null group by a.entity_type
    union all
    select 'actor'::text, x.actor_id::text,
           (select l.actor_email from public.audit_logs l
             where l.actor_id = x.actor_id order by l.created_at desc limit 1),
           x.n
      from (select a.actor_id, count(*) as n from public.audit_logs a
             where a.actor_id is not null group by a.actor_id) as x;
end;
$$;

revoke all on function public.audit_log_facets(timestamptz) from public, anon;
grant execute on function public.audit_log_facets(timestamptz) to authenticated, service_role;
