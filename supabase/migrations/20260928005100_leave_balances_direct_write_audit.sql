-- M5 · Leave management — audit direct writes to leave balances
--
-- HR roles with organization `leave.edit` may insert balance rows and update `opening_balance` /
-- `entitlement` directly through the API (column grants + RLS; the data-management import relies on
-- it). Those writes were not audited: only the RPCs (`set_leave_balance`, `initialize_leave_balances`,
-- `adjust_leave_balance`) wrote audit events, so a balance could be changed without a trace.
--
-- These triggers audit every insert and every opening/entitlement change made directly by an API
-- user. Writes performed inside security-definer functions run as the function owner (not
-- `authenticated`), so the RPCs — which write their own audit events — and the request engine's
-- pending/used bookkeeping are not audited twice.
-- Idempotent: safe to re-run.

drop trigger if exists audit_direct_insert on public.leave_balances;
create trigger audit_direct_insert
  after insert on public.leave_balances
  for each row
  when (current_user = 'authenticated')
  execute function private.audit_row_change('leave_balance');

drop trigger if exists audit_direct_update on public.leave_balances;
create trigger audit_direct_update
  after update of opening_balance, entitlement on public.leave_balances
  for each row
  when (current_user = 'authenticated'
        and (old.opening_balance is distinct from new.opening_balance
             or old.entitlement is distinct from new.entitlement))
  execute function private.audit_row_change('leave_balance');
