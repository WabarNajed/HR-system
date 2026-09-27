-- ---------------------------------------------------------------------------------------------------
-- M10 Data management: parsed workbook storage for the import wizard.
--
-- The import wizard parses an uploaded XLSX/CSV once (route handler), stores the JSON grid of every
-- sheet here and works from it in the later steps (sheet & header detection, mapping, validation,
-- batched import) — the file never has to be uploaded twice and large files never pass through
-- Server Action payloads. The row is deleted when the import completes or is cancelled (import_rows
-- keep the raw values of every row), and it cascades with its `imports` row (organization reset).
--
-- Access mirrors imports / import_rows: private.can_import() (org employees.create or settings.edit).
-- ---------------------------------------------------------------------------------------------------

create table if not exists public.import_sources (
  import_id   uuid primary key references public.imports (id) on delete cascade,
  file_kind   text not null check (file_kind in ('xlsx', 'csv')),
  file_size   bigint not null default 0 check (file_size >= 0),
  sheets      jsonb not null default '[]'::jsonb check (jsonb_typeof(sheets) = 'array'),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

comment on table public.import_sources is
  'Parsed workbook grid (sheets → rows → JSON cells) of an import in progress. Deleted on completion/cancel.';

alter table public.import_sources enable row level security;

revoke all on public.import_sources from anon;
revoke truncate, references, trigger on public.import_sources from authenticated;
grant select, insert, update, delete on public.import_sources to authenticated;

drop policy if exists import_sources_all on public.import_sources;
create policy import_sources_all on public.import_sources for all to authenticated
  using ((select private.can_import()))
  with check ((select private.can_import()));

-- created_by is always the caller for authenticated inserts (never spoofed).
create or replace function private.import_sources_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists import_sources_stamp on public.import_sources;
create trigger import_sources_stamp
  before insert on public.import_sources
  for each row execute function private.import_sources_stamp();

revoke execute on function private.import_sources_stamp() from public, anon, authenticated;

-- Import history is listed newest first; KPIs count the last 30 days.
create index if not exists imports_created_at_idx on public.imports (created_at desc);
