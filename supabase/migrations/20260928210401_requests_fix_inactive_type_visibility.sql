-- =====================================================================================================
-- Requests — a deactivated request type (and its fields) stays readable on the requests that use it.
--
-- Non-HR readers (managers, employees, role approvers) only saw ACTIVE request_types / request_fields
-- under RLS. Once HR deactivated a type, every existing request of that type lost its title for them:
-- the Request Center, the approvals queue and the manager dashboard showed a generic "Request" label,
-- and the request detail lost its type header and field labels (HR still saw them).
--
-- A reader may now also read a type (and that type's field definitions) when at least one request of
-- that type is visible to them. The EXISTS runs as the caller, so `hr_requests` RLS decides — nothing
-- beyond the requests they can already open is revealed, and only configuration metadata is exposed.
-- The new arm is evaluated last (only for inactive rows of non-HR readers) and uses
-- hr_requests_request_type_id_idx. Creating requests still requires an active type (checked in the
-- RPCs and by the wizard's `activeOnly` load), so inactive types are not offered for new requests.
-- No recursion: hr_requests_select reads request_types only through a SECURITY DEFINER helper.
-- Idempotent (drop + create of the same policies).
-- =====================================================================================================

drop policy if exists request_types_select on public.request_types;
create policy request_types_select on public.request_types for select to authenticated
  using (
    (select private.is_active_user())
    and (
      is_active
      or (select private.has_org_permission('settings', 'view'))
      or (select private.has_org_permission('requests', 'view'))
      or exists (select 1 from public.hr_requests r where r.request_type_id = request_types.id)
    )
  );

drop policy if exists request_fields_select on public.request_fields;
create policy request_fields_select on public.request_fields for select to authenticated
  using (
    (select private.is_active_user())
    and (
      is_active
      or (select private.has_org_permission('settings', 'view'))
      or (select private.has_org_permission('requests', 'view'))
      or exists (select 1 from public.hr_requests r where r.request_type_id = request_fields.request_type_id)
    )
  );
