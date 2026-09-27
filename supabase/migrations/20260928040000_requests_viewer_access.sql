-- ===================================================================================================
-- M4 requests & approvals — read-only helpers for the request UI (idempotent: safe to re-run).
--
-- The request RPCs (act_on_request, submit_request, …) remain the only authority. These helpers let the
-- UI show exactly the actions the database would accept, using the same private predicates, instead
-- of re-implementing organization-scope rules (roles.data_scope) in TypeScript:
--
-- 1. get_my_request_access()                     viewer flags for list/queue queries
-- 2. get_request_capabilities(p_request_id)      which actions the viewer may perform on one request now
-- 3. list_request_assignees(p_request_id, …)     eligible reassign targets for one request
-- 4. list_request_handlers()                     HR users who can own requests (Assigned-HR filter options)
-- ===================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- 1. Viewer access flags
-- ---------------------------------------------------------------------------------------------------
create or replace function public.get_my_request_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'active', private.is_active_user(),
    'is_super_admin', private.is_super_admin(),
    'employee_id', private.current_employee_id(),
    'org_view', private.has_org_permission('requests', 'view'),
    'org_create', private.has_org_permission('requests', 'create'),
    'org_edit', private.has_org_permission('requests', 'edit'),
    'org_approve', private.has_org_permission('requests', 'approve') or private.has_org_permission('approvals', 'approve'),
    'role_step_ids', coalesce((select jsonb_agg(s.id) from private.my_role_step_ids() as s(id)), '[]'::jsonb)
  )
$$;
comment on function public.get_my_request_access() is
  'Viewer flags for the request UI (org-scoped request permissions, linked employee, role-step queue). Read-only; RLS and the request RPCs stay authoritative.';

-- ---------------------------------------------------------------------------------------------------
-- 2. Per-request capabilities (mirrors the checks in act_on_request / update_request_draft /
--    submit_request / add_request_comment / can_attach_to_request). NULL when the request is not visible.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.get_request_capabilities(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_req            public.hr_requests;
  v_requester      boolean;
  v_owner          boolean;
  v_pending        boolean;
  v_can_act        boolean;
  v_step_return    boolean := true;
  v_step_reassign  boolean := true;
  v_org_edit       boolean;
  v_org_req_appr   boolean;
  v_final          boolean;
begin
  if not private.is_active_user() then
    return null;
  end if;
  select * into v_req from public.hr_requests where id = p_request_id;
  if not found or not private.can_view_request(p_request_id) then
    return null;
  end if;

  v_requester := v_req.requester_id = auth.uid();
  v_owner := v_requester or v_req.employee_id = private.current_employee_id();
  v_pending := v_req.status in ('pending_manager_approval', 'pending_hr_review');
  v_final := v_req.status in ('rejected', 'completed', 'cancelled');
  v_can_act := v_pending and private.can_act_on_current_step(p_request_id);
  v_org_edit := private.has_org_permission('requests', 'edit');
  v_org_req_appr := private.has_org_permission('requests', 'approve');

  if v_pending then
    select coalesce(rs.can_return, true), coalesce(rs.can_reassign, true)
      into v_step_return, v_step_reassign
    from private.resolve_steps(v_req.request_type_id) rs
    where rs.step_order = v_req.current_step_order;
    v_step_return := coalesce(v_step_return, true);
    v_step_reassign := coalesce(v_step_reassign, true);
  end if;

  return jsonb_build_object(
    'is_requester', v_requester,
    'is_owner', v_owner,
    'can_approve', v_can_act,
    'can_reject', v_can_act,
    'can_return', v_can_act and v_step_return,
    'can_reassign',
      (v_pending and v_step_reassign and v_req.current_step_type in ('hr', 'manager', 'user') and (v_can_act or v_org_edit))
      or (v_req.status in ('approved', 'in_progress') and v_org_edit),
    'reassign_scope',
      case when v_req.status in ('approved', 'in_progress') then 'fulfilment'
           when v_req.current_step_type = 'hr' then 'hr'
           else 'approver' end,
    'can_start', v_req.status = 'approved' and (v_org_edit or v_org_req_appr),
    'can_complete', v_req.status in ('approved', 'in_progress') and (v_org_edit or v_org_req_appr),
    'can_cancel', not v_final and (
      (v_owner and v_req.status in ('draft', 'submitted', 'pending_manager_approval', 'pending_hr_review', 'returned'))
      or v_org_edit),
    'can_edit', v_requester and v_req.status in ('draft', 'returned'),
    'can_submit', v_requester and v_req.status in ('draft', 'returned'),
    'can_delete', v_requester and v_req.status = 'draft',
    'can_attach', private.can_attach_to_request(p_request_id),
    'can_remove_any_attachment', private.can_attach_to_request(p_request_id) and v_org_edit,
    'can_comment', true,
    'can_comment_internal', private.has_org_permission('requests', 'view'),
    'can_view_internal', private.has_org_permission('requests', 'view')
  );
end;
$$;
comment on function public.get_request_capabilities(uuid) is
  'Actions the caller may perform on the request right now (same predicates as the request RPCs); NULL when not visible.';

-- ---------------------------------------------------------------------------------------------------
-- 3. Eligible reassign targets (same rules as act_on_request ''reassign''):
--    fulfilment (approved / in_progress) → active users with org requests.edit
--    HR step                              → active users with org requests.approve or approvals.approve
--    manager / user step                  → any active user
--    never the requester, the employee, or the current approver / assignee.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.list_request_assignees(p_request_id uuid, p_query text default null, p_limit int default 20)
returns table (
  id uuid, full_name text, email text, employee_number text, name_ar text, name_en text, job_title_ar text, job_title_en text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_caps   jsonb;
  v_req    public.hr_requests;
  v_scope  text;
  v_emp    uuid;
  v_q      text := lower(btrim(coalesce(p_query, '')));
begin
  v_caps := public.get_request_capabilities(p_request_id);
  if v_caps is null then
    raise exception 'hr:errors.notFound' using errcode = 'P0002';
  end if;
  if not coalesce((v_caps ->> 'can_reassign')::boolean, false) then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v_req from public.hr_requests where id = p_request_id;
  v_scope := v_caps ->> 'reassign_scope';
  v_emp := private.employee_profile_id(v_req.employee_id);

  return query
    select p.id, p.full_name, p.email, e.employee_number, e.name_ar, e.name_en, jt.name_ar, jt.name_en
    from public.profiles p
    left join public.employees e on e.id = p.employee_id
    left join public.job_titles jt on jt.id = e.job_title_id
    where p.status = 'active'
      and p.id is distinct from v_req.requester_id
      and p.id is distinct from v_emp
      and p.id is distinct from (case when v_scope = 'approver' then v_req.current_approver_id else v_req.assigned_to end)
      and (
        (v_scope = 'fulfilment' and private.user_has_permission(p.id, 'requests', 'edit', true))
        or (v_scope = 'hr' and (private.user_has_permission(p.id, 'requests', 'approve', true)
                                or private.user_has_permission(p.id, 'approvals', 'approve', true)))
        or v_scope = 'approver'
      )
      and (
        v_q = ''
        or lower(coalesce(p.full_name, '')) like '%' || v_q || '%'
        or lower(coalesce(p.email, '')) like '%' || v_q || '%'
        or lower(coalesce(e.name_ar, '')) like '%' || v_q || '%'
        or lower(coalesce(e.name_en, '')) like '%' || v_q || '%'
        or lower(coalesce(e.employee_number, '')) like '%' || v_q || '%'
      )
    order by coalesce(e.name_en, p.full_name, p.email)
    limit greatest(1, least(coalesce(p_limit, 20), 50));
end;
$$;
comment on function public.list_request_assignees(uuid, text, int) is
  'Reassign targets the caller may pick for the request (mirrors act_on_request reassign rules).';

-- ---------------------------------------------------------------------------------------------------
-- 4. Request handlers (HR users able to own / decide requests) — options for the "Assigned HR" filter.
--    Only for callers with org requests.view (hr_officer cannot read user_roles directly).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.list_request_handlers()
returns table (id uuid, full_name text, email text, name_ar text, name_en text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.has_org_permission('requests', 'view') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, e.name_ar, e.name_en
    from public.profiles p
    left join public.employees e on e.id = p.employee_id
    where p.status = 'active'
      and (private.user_has_permission(p.id, 'requests', 'approve', true)
           or private.user_has_permission(p.id, 'approvals', 'approve', true)
           or private.user_has_permission(p.id, 'requests', 'edit', true))
    order by coalesce(e.name_en, p.full_name, p.email)
    limit 200;
end;
$$;
comment on function public.list_request_handlers() is
  'Active users who can review or fulfil requests organization-wide (Assigned-HR filter); org requests.view only.';

-- Supabase grants EXECUTE on new functions to anon: signed-in users only.
revoke execute on function public.get_my_request_access() from public, anon;
revoke execute on function public.get_request_capabilities(uuid) from public, anon;
revoke execute on function public.list_request_assignees(uuid, text, int) from public, anon;
revoke execute on function public.list_request_handlers() from public, anon;
grant execute on function public.get_my_request_access() to authenticated, service_role;
grant execute on function public.get_request_capabilities(uuid) to authenticated, service_role;
grant execute on function public.list_request_assignees(uuid, text, int) to authenticated, service_role;
grant execute on function public.list_request_handlers() to authenticated, service_role;
