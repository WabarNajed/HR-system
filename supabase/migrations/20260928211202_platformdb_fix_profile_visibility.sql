-- =====================================================================================================
-- Platform DB fix — full `profiles` rows are no longer readable by every active employee.
--
-- Before: profiles_select also allowed `id in private.visible_profile_ids()` (every active holder of an
-- organization-scope role — HR / Super Admin — plus the caller's manager and direct reports), so ANY
-- active employee could read those users' full rows: e-mail, mobile, last_login_at, registration data
-- and review notes.
--
-- After:
--   * public.profiles (full row): own row, or active org viewers (`users.view` org-wide, or HR).
--   * public.profile_cards (NEW, read-only): id, full_name, employee_id, status — the display card the
--     UI needs for approvers / assignees / requesters / uploaders / reviewers / actors. Visible for the
--     same people as before (own, org viewers, visible_profile_ids()). It is a definer view with its own
--     row filter (the owner bypasses RLS on profiles), marked security_barrier, SELECT-only.
--   * public.employee_document_list resolves uploader / reviewer names through profile_cards, so an
--     employee still sees who reviewed their document without reading that person's profile row.
-- Idempotent.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- profiles: full rows for self + org viewers only
-- ---------------------------------------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (
      (select private.is_active_user())
      and ((select private.has_org_permission('users', 'view')) or (select private.is_hr()))
    )
  );

-- ---------------------------------------------------------------------------------------------------
-- profile_cards: name-only directory of the profiles the caller may know about
-- ---------------------------------------------------------------------------------------------------
create or replace view public.profile_cards
with (security_barrier = true) as
select p.id, p.full_name, p.employee_id, p.status
from public.profiles p
where p.id = (select auth.uid())
   or (
     (select private.is_active_user())
     and (
       (select private.has_org_permission('users', 'view'))
       or (select private.is_hr())
       or p.id in (select private.visible_profile_ids())
     )
   );

alter view public.profile_cards owner to postgres;
alter view public.profile_cards set (security_invoker = false);

comment on view public.profile_cards is
  'Display card (id, full_name, employee_id, status) of the profiles the caller may see: own, org viewers '
  '(users.view / HR) see all, other active users see HR / Super Admin staff, their manager and direct reports. '
  'Read-only; use it for names of approvers, assignees, requesters, uploaders and reviewers. Full rows: public.profiles.';

-- Definer view on a single table is auto-updatable: SELECT only, never writable through it.
revoke all on public.profile_cards from public, anon, authenticated;
grant select on public.profile_cards to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- employee_document_list: uploader / reviewer names through profile_cards (same columns, same order)
-- ---------------------------------------------------------------------------------------------------
create or replace view public.employee_document_list
with (security_invoker = true) as
select
  d.id,
  d.employee_id,
  d.document_type,
  d.document_number,
  d.issue_date,
  d.expiry_date,
  d.status,
  d.storage_path,
  d.file_name,
  d.file_size,
  d.mime_type,
  d.notes,
  d.is_confidential,
  d.uploaded_by,
  d.created_at,
  d.updated_at,
  d.review_note,
  d.reviewed_by,
  d.reviewed_at,
  e.employee_number,
  e.name_ar as employee_name_ar,
  e.name_en as employee_name_en,
  e.department_id,
  dep.name_ar as department_name_ar,
  dep.name_en as department_name_en,
  e.employment_status,
  e.avatar_path as employee_avatar_path,
  e.archived_at as employee_archived_at,
  up.full_name as uploaded_by_name,
  (up.employee_id is not null and up.employee_id = d.employee_id) as self_uploaded,
  rv.full_name as reviewed_by_name,
  lower(concat_ws(' ', e.search_text, d.document_number, d.file_name)) as search_text
from public.employee_documents d
join public.employees e on e.id = d.employee_id
left join public.departments dep on dep.id = e.department_id
left join public.profile_cards up on up.id = d.uploaded_by
left join public.profile_cards rv on rv.id = d.reviewed_by;

revoke all on public.employee_document_list from public, anon;
grant select on public.employee_document_list to authenticated;

notify pgrst, 'reload schema';
