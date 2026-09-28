-- M5 · Leave management
--
-- Leave configuration (leave types, public holidays) is managed from /settings/leave-types,
-- /settings/public-holidays and the Leave Types / Public Holidays tabs of /leave. ROUTE_ACCESS opens
-- those screens to `settings.view` OR `leave.administer`, so a (custom) organization-scoped role that
-- administers leave without holding `settings.edit` must also be able to write these two tables.
-- The existing `settings.edit` policies are untouched; these are additional permissive policies that
-- require `leave.administer` through an organization-scoped role (private.has_org_permission).
-- Idempotent: safe to re-run.

do $$
declare
  t  text;
  op text;
begin
  foreach t in array array['leave_types', 'public_holidays'] loop
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_leave_admin_' || op, t);
      if op = 'insert' then
        execute format(
          'create policy %I on public.%I for insert to authenticated with check ((select private.has_org_permission(%L, %L)))',
          t || '_leave_admin_insert', t, 'leave', 'administer');
      elsif op = 'update' then
        execute format(
          'create policy %I on public.%I for update to authenticated using ((select private.has_org_permission(%L, %L))) with check ((select private.has_org_permission(%L, %L)))',
          t || '_leave_admin_update', t, 'leave', 'administer', 'leave', 'administer');
      else
        execute format(
          'create policy %I on public.%I for delete to authenticated using ((select private.has_org_permission(%L, %L)))',
          t || '_leave_admin_delete', t, 'leave', 'administer');
      end if;
    end loop;
  end loop;
end;
$$;

-- Inactive leave types stay readable for leave administrators (the management table lists them).
drop policy if exists leave_types_select on public.leave_types;
create policy leave_types_select on public.leave_types for select to authenticated
  using (
    (select private.is_active_user())
    and (is_active
         or (select private.has_org_permission('settings', 'view'))
         or (select private.has_org_permission('leave', 'view'))
         or (select private.has_org_permission('leave', 'administer')))
  );
