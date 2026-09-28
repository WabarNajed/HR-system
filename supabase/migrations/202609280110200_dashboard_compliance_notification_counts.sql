-- =====================================================================================================
-- M11 — dashboard compliance counters aligned with the documents expiry monitor + notification counts
--
-- The dashboard's compliance cards and expiry alerts link to `/documents?tab=expiry&kind=…&bucket=…`,
-- which lists `public.expiry_items` (documents module: employees' and dependents' Iqama / passport,
-- contracts, insurance, documents). Counting from `dashboard_stats().hr.expiring` (employees only,
-- other status filters) made the numbers on the cards differ from the list they open. Both dashboard
-- readers now use the same view, so a card and its destination always agree.
--
--   dashboard_compliance_counts()                          → jsonb {kind: {expired, d30, d90}}
--   dashboard_expiry_items(p_days, p_limit, p_employee_id) → rows (now incl. dependents' items)
--   notification_counts()                                  → (type, total, unread) of the caller
--
-- All SECURITY INVOKER (RLS + the view's own filter decide what is counted); read-only.
-- PL/pgSQL on purpose for the view readers: this file sorts before the documents migration that
-- creates `public.expiry_items`, and PL/pgSQL bodies are only resolved when first executed.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Compliance counters per kind. Bands match the documents expiry filter (`bucket`):
--   expired = days_left < 0 · d30 = 0‥30 · d90 = 0‥90 (cumulative, as shown on the cards).
-- ---------------------------------------------------------------------------------------------------
create or replace function public.dashboard_compliance_counts()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.org_today();
  v_result jsonb;
begin
  if not (select private.is_active_user()) then
    return '{}'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(k.kind, jsonb_build_object(
           'expired', coalesce(c.expired, 0),
           'd30', coalesce(c.d30, 0),
           'd90', coalesce(c.d90, 0))), '{}'::jsonb)
    into v_result
  from (values ('iqama'), ('passport'), ('contract'), ('insurance'), ('document')) as k(kind)
  left join (
    select x.kind,
           count(*) filter (where x.expiry_date < v_today) as expired,
           count(*) filter (where x.expiry_date between v_today and v_today + 30) as d30,
           count(*) filter (where x.expiry_date between v_today and v_today + 90) as d90
    from public.expiry_items x
    where x.expiry_date <= v_today + 90
    group by x.kind
  ) c on c.kind = k.kind;

  return v_result;
end;
$$;

comment on function public.dashboard_compliance_counts() is
  'M11: expired / ≤30 / ≤90-day counts per expiry kind from public.expiry_items (security invoker).';

-- ---------------------------------------------------------------------------------------------------
-- Expired / expiring items, most urgent first — same population as the documents expiry monitor.
-- Return type changes (subject + dependent names) → drop and recreate.
-- ---------------------------------------------------------------------------------------------------
drop function if exists public.dashboard_expiry_items(int, int);
drop function if exists public.dashboard_expiry_items(int, int, uuid);

create function public.dashboard_expiry_items(
  p_days int default 90,
  p_limit int default 10,
  p_employee_id uuid default null
)
returns table (
  kind text,
  subject text,
  entity_id uuid,
  employee_id uuid,
  employee_name_ar text,
  employee_name_en text,
  employee_number text,
  dependent_name_ar text,
  dependent_name_en text,
  document_type text,
  expiry_date date,
  days_left int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_today date := private.org_today();
  v_days int := least(greatest(coalesce(p_days, 90), 0), 365);
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 100);
begin
  if not (select private.is_active_user()) then
    return;
  end if;

  return query
    select x.kind, x.subject, x.entity_id, x.employee_id, x.employee_name_ar, x.employee_name_en, x.employee_number,
           x.dependent_name_ar, x.dependent_name_en, x.document_type, x.expiry_date, (x.expiry_date - v_today)::int
    from public.expiry_items x
    where x.expiry_date <= v_today + v_days
      and (p_employee_id is null or x.employee_id = p_employee_id)
    order by x.expiry_date, x.kind, x.employee_number
    limit v_limit;
end;
$$;

comment on function public.dashboard_expiry_items(int, int, uuid) is
  'M11: expired and expiring (≤ p_days) items of public.expiry_items, optionally for one employee (security invoker).';

-- ---------------------------------------------------------------------------------------------------
-- Notification counts of the caller per type (notifications center tabs, type filter and summary):
-- one grouped read instead of one count request per category.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.notification_counts()
returns table (type text, total bigint, unread bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.type, count(*), count(*) filter (where n.read_at is null)
  from public.notifications n
  where n.user_id = (select auth.uid())
  group by n.type
$$;

comment on function public.notification_counts() is
  'M11: the caller''s notifications per type with unread counts (security invoker — own rows only).';

-- Signed-in users only (Supabase grants EXECUTE on new functions to anon by default).
revoke execute on function public.dashboard_compliance_counts() from public, anon;
revoke execute on function public.dashboard_expiry_items(int, int, uuid) from public, anon;
revoke execute on function public.notification_counts() from public, anon;
grant execute on function public.dashboard_compliance_counts() to authenticated;
grant execute on function public.dashboard_expiry_items(int, int, uuid) to authenticated;
grant execute on function public.notification_counts() to authenticated;
