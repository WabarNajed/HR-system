-- ---------------------------------------------------------------------------------------------------
-- M10 Data management: per-type access to imports, import_rows and import_sources.
--
-- Until now every holder of org `employees.create` OR `settings.edit` (private.can_import) could read
-- and write every import of every type — e.g. a role with only `settings.edit` could read the raw rows
-- of an employee import (Iqama / passport numbers, dates of birth), and an HR officer could create or
-- edit master-data imports it can never run. Access now also requires the permission that the import's
-- target table needs (the same matrix as src/features/data-management/permissions.ts):
--
--   employees                                    employees.create
--   departments, job_titles, locations,
--   cost_centers, public_holidays                settings.edit
--   leave_balances                               leave.edit
--   dependents                                   personal_data.create | personal_data.edit
--   insurance                                    insurance.create | insurance.edit
--   documents                                    documents.create
--
-- import_rows / import_sources follow their parent import (EXISTS on imports, which carries the check).
-- Only tightens the previous policies (can_import() is still required).
-- ---------------------------------------------------------------------------------------------------

create or replace function private.can_import_type(p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_import() and coalesce(
    case p_type
      when 'employees' then private.has_org_permission('employees', 'create')
      when 'departments' then private.has_org_permission('settings', 'edit')
      when 'job_titles' then private.has_org_permission('settings', 'edit')
      when 'locations' then private.has_org_permission('settings', 'edit')
      when 'cost_centers' then private.has_org_permission('settings', 'edit')
      when 'public_holidays' then private.has_org_permission('settings', 'edit')
      when 'leave_balances' then private.has_org_permission('leave', 'edit')
      when 'dependents' then private.has_org_permission('personal_data', 'create') or private.has_org_permission('personal_data', 'edit')
      when 'insurance' then private.has_org_permission('insurance', 'create') or private.has_org_permission('insurance', 'edit')
      when 'documents' then private.has_org_permission('documents', 'create')
      else false
    end,
    false)
$$;

comment on function private.can_import_type(text) is
  'True when the caller may work on imports of this type (can_import() + the target table''s permission).';

revoke all on function private.can_import_type(text) from public, anon, authenticated;
grant execute on function private.can_import_type(text) to authenticated, service_role;

-- imports ------------------------------------------------------------------------------------------------------------
drop policy if exists imports_all on public.imports;
create policy imports_all on public.imports for all to authenticated
  using ((select private.can_import()) and private.can_import_type(import_type))
  with check ((select private.can_import()) and private.can_import_type(import_type));

-- import_rows --------------------------------------------------------------------------------------------------------
drop policy if exists import_rows_all on public.import_rows;
create policy import_rows_all on public.import_rows for all to authenticated
  using ((select private.can_import()) and exists (select 1 from public.imports i where i.id = import_rows.import_id))
  with check ((select private.can_import()) and exists (select 1 from public.imports i where i.id = import_rows.import_id));

-- import_sources -----------------------------------------------------------------------------------------------------
drop policy if exists import_sources_all on public.import_sources;
create policy import_sources_all on public.import_sources for all to authenticated
  using ((select private.can_import()) and exists (select 1 from public.imports i where i.id = import_sources.import_id))
  with check ((select private.can_import()) and exists (select 1 from public.imports i where i.id = import_sources.import_id));

-- History filters (type, status) and the error filter scan imports newest first.
create index if not exists imports_type_created_at_idx on public.imports (import_type, created_at desc);
