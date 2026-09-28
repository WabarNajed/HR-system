-- employees.extra_data: direct Data API updates merge into the stored object instead of replacing it.
--
-- `extra_data` keeps unmapped import columns verbatim and is written only by the import commit, which
-- merges new keys into what is stored. Since 20260928210301 the column is readable only by org
-- personal_data.view / employees.create; a writer that cannot read it (or a failed read) would
-- otherwise replace the stored object and silently drop earlier import columns. Definer RPCs and the
-- service role (CLI imports) are unaffected (current_user <> 'authenticated').
-- Idempotent.

create or replace function private.employees_extra_data_merge()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.extra_data is distinct from old.extra_data then
    new.extra_data := coalesce(old.extra_data, '{}'::jsonb) || coalesce(new.extra_data, '{}'::jsonb);
  end if;
  return new;
end;
$$;
revoke all on function private.employees_extra_data_merge() from public, anon, authenticated;

drop trigger if exists employees_extra_data_merge on public.employees;
create trigger employees_extra_data_merge
  before update of extra_data on public.employees
  for each row execute function private.employees_extra_data_merge();
