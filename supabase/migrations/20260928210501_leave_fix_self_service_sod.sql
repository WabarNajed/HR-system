-- Leave fix · segregation of duties for HR writes on the actor's OWN records
--
-- "Nobody approves their own request" (request engine, can_act_on_current_step) had no counterpart
-- for the direct HR writes: an HR officer with organization `leave.edit` could add days to their own
-- leave balance (adjust_leave_balance / set_leave_balance / direct PostgREST writes), and an HR admin
-- with `bank.edit` could raise their own salary or redirect their own IBAN (save_employee /
-- direct PostgREST writes on employee_compensation / employee_bank_accounts).
--
-- 1. private.is_self_hr_target(employee_id): true when the target is the caller's own employee record
--    and the caller is not super_admin (same exception as the approval rule: single-admin orgs).
-- 2. adjust_leave_balance / set_leave_balance / initialize_leave_balances (single employee) refuse
--    the caller's own employee with `hr:errors.selfChangeNotAllowed` (SQLSTATE 42501).
-- 3. BEFORE INSERT/UPDATE/DELETE trigger private.self_record_write_guard() on leave_balances,
--    employee_compensation and employee_bank_accounts refuses API writes (current_user =
--    'authenticated', i.e. direct PostgREST writes and security-INVOKER RPCs such as save_employee)
--    that CHANGE the caller's own row. A no-op write is allowed so an HR admin can still save the
--    other fields of their own employee profile (save_employee re-sends unchanged compensation/bank
--    values). Security-definer code (request engine bookkeeping, the RPCs above) runs as the owner
--    and is not affected; the RPCs carry their own check.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------------------------------------------
create or replace function private.is_self_hr_target(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_employee_id is not null
     and p_employee_id = private.current_employee_id()
     and not private.is_super_admin()
$$;
revoke all on function private.is_self_hr_target(uuid) from public, anon;
grant execute on function private.is_self_hr_target(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------
-- 2. Balance RPCs (bodies unchanged apart from the self check)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.adjust_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year int,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal     public.leave_balances;
  v_bal_id  uuid;
  v_lt      public.leave_types;
  v_new     numeric;
  v_id      uuid;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if private.is_self_hr_target(p_employee_id) then
    raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'hr:errors.validation' using detail = 'amount';
  end if;
  if private.nullif_blank(p_reason) is null then
    raise exception 'hr:errors.reasonRequired';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  select * into v_lt from public.leave_types where id = p_leave_type_id;
  if not found then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'leave_type';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
  end if;

  v_bal_id := private.ensure_leave_balance(p_employee_id, p_leave_type_id, p_year);
  select * into v_bal from public.leave_balances b where b.id = v_bal_id for update;
  update public.leave_balances set adjustment = adjustment + p_amount where id = v_bal.id
  returning remaining into v_new;

  insert into public.leave_adjustments (leave_balance_id, amount, reason, old_remaining, new_remaining, changed_by)
  values (v_bal.id, p_amount, btrim(p_reason), v_bal.remaining, v_new, auth.uid())
  returning id into v_id;

  perform private.notify(
    private.employee_profile_id(p_employee_id), 'leave_balance_adjusted',
    jsonb_build_object('leave_type_name_ar', v_lt.name_ar, 'leave_type_name_en', v_lt.name_en, 'amount', p_amount,
                       'year', p_year, 'old_remaining', v_bal.remaining, 'new_remaining', v_new,
                       'actor_name', private.profile_display_name(auth.uid())),
    '/leave', 'leave_balance', v_bal.id
  );
  return v_id;
end;
$$;

create or replace function public.set_leave_balance(
  p_employee_id uuid,
  p_leave_type_id uuid,
  p_year int,
  p_opening_balance numeric,
  p_entitlement numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_old public.leave_balances;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if private.is_self_hr_target(p_employee_id) then
    raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'employee';
  end if;
  if not exists (select 1 from public.leave_types where id = p_leave_type_id) then
    raise exception 'hr:errors.notFound' using errcode = 'P0002', detail = 'leave_type';
  end if;
  v_id := private.ensure_leave_balance(p_employee_id, p_leave_type_id, p_year);
  select * into v_old from public.leave_balances where id = v_id for update;
  update public.leave_balances
  set opening_balance = coalesce(p_opening_balance, opening_balance),
      entitlement = coalesce(p_entitlement, entitlement)
  where id = v_id;
  perform private.write_audit('leave_balance.update', 'leave_balance', v_id::text, p_year::text,
    jsonb_build_object('opening_balance', jsonb_build_object('old', v_old.opening_balance, 'new', coalesce(p_opening_balance, v_old.opening_balance)),
                       'entitlement', jsonb_build_object('old', v_old.entitlement, 'new', coalesce(p_entitlement, v_old.entitlement))),
    p_employee_id);
  return v_id;
end;
$$;

-- Bulk initialization (p_employee_id null) only creates missing rows with the leave type's default
-- entitlement for everyone, so it stays allowed; initializing ONE employee is refused for oneself.
create or replace function public.initialize_leave_balances(p_year int, p_employee_id uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not private.has_org_permission('leave', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if private.is_self_hr_target(p_employee_id) then
    raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
  end if;
  if p_year is null or p_year not between 2000 and 2200 then
    raise exception 'hr:errors.validation' using detail = 'year';
  end if;
  insert into public.leave_balances (employee_id, leave_type_id, year, entitlement)
  select e.id, lt.id, p_year, lt.default_entitlement
  from public.employees e
  cross join public.leave_types lt
  where lt.is_active and lt.deducts_balance
    and e.archived_at is null
    and e.employment_status not in ('resigned', 'terminated')
    and (p_employee_id is null or e.id = p_employee_id)
    and (lt.gender_restriction is null or lt.gender_restriction = e.gender)
  on conflict (employee_id, leave_type_id, year) do nothing;
  get diagnostics v_count = row_count;
  perform private.write_audit('leave_balance.initialize', 'leave_balance', p_year::text,
                              p_year::text || ': ' || v_count || ' balances', null, p_employee_id);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 3. Direct / invoker writes on the caller's own sensitive rows
-- ---------------------------------------------------------------------------------------------------
-- Not security definer: current_user must be the API caller. Columns maintained by other triggers or
-- generated are ignored when deciding whether an UPDATE changes anything.
create or replace function private.self_record_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ignore text[] := array['created_at', 'created_by', 'updated_at', 'updated_by', 'total_salary', 'remaining'];
  v_row    jsonb;
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if private.is_self_hr_target(old.employee_id) then
      raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if (private.is_self_hr_target(old.employee_id) or private.is_self_hr_target(new.employee_id))
       and (to_jsonb(new) - v_ignore) is distinct from (to_jsonb(old) - v_ignore) then
      raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
    end if;
    return new;
  end if;

  -- INSERT
  if private.is_self_hr_target(new.employee_id) then
    -- INSERT … ON CONFLICT DO UPDATE fires this trigger before the conflict is detected: when the
    -- one-per-employee row already exists the statement becomes an UPDATE (guarded above) or fails
    -- on the unique key, so it is not a new record.
    -- (columns read through jsonb: the function serves tables with different shapes)
    v_row := to_jsonb(new);
    if tg_table_name = 'employee_compensation' then
      if exists (select 1 from public.employee_compensation c where c.employee_id = new.employee_id) then
        return new;
      end if;
    elsif tg_table_name = 'leave_balances' then
      if exists (select 1 from public.leave_balances b
                 where b.employee_id = new.employee_id
                   and b.leave_type_id = (v_row ->> 'leave_type_id')::uuid
                   and b.year = (v_row ->> 'year')::int) then
        return new;
      end if;
    end if;
    raise exception 'hr:errors.selfChangeNotAllowed' using errcode = '42501', detail = 'self';
  end if;
  return new;
end;
$$;
revoke all on function private.self_record_write_guard() from public, anon, authenticated;

-- "z_" prefix: BEFORE triggers fire in name order, so the guard sees the row after IBAN
-- normalization and the audit-field stamping.
drop trigger if exists z_self_write_guard on public.leave_balances;
create trigger z_self_write_guard
  before insert or update or delete on public.leave_balances
  for each row execute function private.self_record_write_guard();

drop trigger if exists z_self_write_guard on public.employee_compensation;
create trigger z_self_write_guard
  before insert or update or delete on public.employee_compensation
  for each row execute function private.self_record_write_guard();

drop trigger if exists z_self_write_guard on public.employee_bank_accounts;
create trigger z_self_write_guard
  before insert or update or delete on public.employee_bank_accounts
  for each row execute function private.self_record_write_guard();
