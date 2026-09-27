-- =====================================================================================================
-- HR Portal — foundation: extensions, private schema, generic trigger helpers
-- =====================================================================================================
-- Extensions are not pre-installed on hosted Supabase; create them in schema `extensions`.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- `private` holds authorization helpers, trigger functions and internal engine code. It is NOT exposed
-- through the Data API (PostgREST only exposes `public` / `graphql_public`).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is 'HR Portal internal helpers (RLS helpers, triggers, workflow engine). Not exposed via the Data API.';

-- -----------------------------------------------------------------------------------------------------
-- created_at / created_by / updated_at / updated_by maintenance (BEFORE INSERT OR UPDATE).
-- * authenticated callers can never spoof created_by / updated_by (always auth.uid()).
-- * service-role / migration code (auth.uid() is null) may attribute a change explicitly by setting
--   updated_by; otherwise it is recorded as NULL (= system).
-- -----------------------------------------------------------------------------------------------------
create or replace function private.set_audit_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := new.created_at;
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := coalesce(
      auth.uid(),
      case when new.updated_by is distinct from old.updated_by then new.updated_by end
    );
  end if;
  return new;
end;
$$;

-- Tables that only carry updated_at (no created_by/updated_by columns).
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Safe text → uuid cast (NULL when the text is not a uuid). Used for storage paths.
create or replace function private.try_uuid(p_value text)
returns uuid
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid
  end
$$;

-- Search normalisation: lower-case, strip Arabic diacritics/tatweel, fold alef/ya/ta-marbuta variants.
create or replace function private.normalize_search(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(
    translate(
      regexp_replace(coalesce(p_value, ''), '[ً-ْٰـ]', '', 'g'),
      'أإآٱىةؤئ',
      'اااايهوي'
    )
  )
$$;

-- Removes empty-string values so that "" never masquerades as data.
create or replace function private.nullif_blank(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(p_value), '')
$$;
