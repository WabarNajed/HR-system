-- =====================================================================================================
-- Requests — Request Center / Approvals counters in one RLS-scoped scan.
--
-- /requests ran 13 separate `count(*)` head requests (7 tab counts + 6 KPIs) and /approvals 3 more for
-- its queue; each one re-evaluated the hr_requests RLS policy and held its own PostgREST connection.
-- `request_center_counts` returns every counter from a single pass with `count(*) filter (...)`.
--
-- SECURITY INVOKER: the caller's hr_requests RLS decides which rows are counted, exactly like the old
-- per-counter queries. The "awaiting my decision" predicate mirrors `pendingForMeOr()` in
-- src/features/requests/queries.ts (and private.can_act_on_current_step): manager/user steps assigned
-- to me; the HR queue for org approvers; role-step queues — never my own requests (super admin
-- excepted). Status sets mirror TAB_STATUSES / OPEN_STATUSES in src/features/requests/constants.ts.
-- p_month_start is the start of the current month in the organization time zone (computed by the app).
-- Idempotent (create or replace).
-- =====================================================================================================

create or replace function public.request_center_counts(
  p_now timestamptz default now(),
  p_month_start timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select
      (select auth.uid()) as uid,
      private.current_employee_id() as emp,
      private.is_super_admin() as sa,
      (private.has_org_permission('requests', 'approve') or private.has_org_permission('approvals', 'approve')) as org_approve,
      coalesce((select array_agg(s.id) from private.my_role_step_ids() as s(id)), '{}'::uuid[]) as role_steps
  ),
  r as (
    select
      h.status,
      h.due_at,
      h.completed_at,
      h.status in ('submitted', 'pending_manager_approval', 'pending_hr_review', 'approved', 'in_progress') as is_open,
      coalesce(
        (h.status in ('pending_manager_approval', 'pending_hr_review')
          and h.current_step_type in ('manager', 'user')
          and h.current_approver_id = me.uid)
        or (
          (me.sa or ((h.requester_id is null or h.requester_id <> me.uid) and (me.emp is null or h.employee_id <> me.emp)))
          and (
            (me.org_approve and h.status = 'pending_hr_review' and h.current_step_type = 'hr')
            or (h.status in ('pending_manager_approval', 'pending_hr_review')
                and h.current_step_type = 'role'
                and h.current_step_id = any (me.role_steps))
          )
        ),
        false
      ) as for_me,
      (h.status = 'returned' and h.requester_id = me.uid) as my_returned
    from public.hr_requests h
    cross join me
  )
  select jsonb_build_object(
    'tabs', jsonb_build_object(
      'all', count(*) filter (where r.status <> 'draft'),
      'pending', count(*) filter (where r.status in ('submitted', 'pending_manager_approval', 'pending_hr_review')),
      'in_progress', count(*) filter (where r.status in ('approved', 'in_progress')),
      'completed', count(*) filter (where r.status = 'completed'),
      'rejected', count(*) filter (where r.status = 'rejected'),
      'returned', count(*) filter (where r.status = 'returned'),
      'drafts', count(*) filter (where r.status = 'draft')
    ),
    'open', count(*) filter (where r.is_open or r.status = 'returned'),
    'awaiting_approvals', count(*) filter (where r.for_me),
    'awaiting_returned', count(*) filter (where r.my_returned),
    'overdue', count(*) filter (where r.is_open and r.due_at < p_now),
    'due_soon', count(*) filter (where r.is_open and r.due_at >= p_now and r.due_at <= p_now + interval '24 hours'),
    'completed_month', count(*) filter (
      where r.status = 'completed' and r.completed_at >= coalesce(p_month_start, date_trunc('month', p_now))
    ),
    'queue_overdue', count(*) filter (where r.for_me and r.is_open and r.due_at < p_now),
    'queue_due_soon', count(*) filter (where r.for_me and r.due_at >= p_now and r.due_at <= p_now + interval '24 hours')
  )
  from r
$$;

comment on function public.request_center_counts(timestamptz, timestamptz) is
  'Request Center tab counts, KPIs and the approvals-queue counters in one RLS-scoped scan (security invoker).';

revoke execute on function public.request_center_counts(timestamptz, timestamptz) from public, anon;
grant execute on function public.request_center_counts(timestamptz, timestamptz) to authenticated;
