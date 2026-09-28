-- =====================================================================================================
-- Platform DB fix — certificate verification codes are masked in the audit trail.
--
-- Before: the row-change trigger on public.certificates wrote `changes.verification_code.new` in clear
-- (private.mask_changes only knew salary / IBAN / ID-number keys). Every audit.view holder (Audit log,
-- Activity tabs, audit reports and exports) could read the secret that /verify requires before it
-- reveals the employee's name, certificate type and issue date — defeating the enumeration guard added
-- in 20260928210702.
--
-- After:
--   * private.mask_changes() also masks `verification_code` (same rules as the other keys: a non-null
--     value — or each non-null old/new of a change object — becomes "***").
--   * Existing audit rows that already hold a clear-text code are redacted once, here. audit_logs is
--     append-only (no UPDATE privilege for anyone + trigger audit_logs_immutable); the owner lifts both
--     only inside this migration's transaction for this single UPDATE of the `verification_code` key and
--     restores them before commit (net privilege / trigger change: none). Nothing else in the rows
--     changes.
-- Idempotent.
-- =====================================================================================================

create or replace function private.mask_changes(p_changes jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_changes is null or jsonb_typeof(p_changes) <> 'object' then p_changes
    else coalesce((
      select jsonb_object_agg(
        k,
        case
          when k = any (array['iban', 'basic_salary', 'housing_allowance', 'transport_allowance', 'other_allowance',
                              'total_salary', 'national_id', 'passport_number', 'salary', 'amount_salary',
                              'verification_code'])
            then case
              when jsonb_typeof(v) = 'object' then (
                select jsonb_object_agg(k2, case when v2 = 'null'::jsonb then v2 else '"***"'::jsonb end)
                from jsonb_each(v) as e2(k2, v2))
              when v = 'null'::jsonb then v
              else '"***"'::jsonb
            end
          else v
        end)
      from jsonb_each(p_changes) as e(k, v)
    ), '{}'::jsonb)
  end
$$;

comment on function private.mask_changes(jsonb) is
  'Masks sensitive keys of an audit changes object (salary components, IBAN, national ID, passport number, '
  'certificate verification_code): non-null values, or each non-null old/new of a change object, become "***".';


-- one-time redaction of codes written before this migration -----------------------------------------
do $$
begin
  if exists (
    select 1 from public.audit_logs a
    where a.changes ? 'verification_code'
      and a.changes -> 'verification_code' is distinct from private.mask_changes(
            jsonb_build_object('verification_code', a.changes -> 'verification_code')) -> 'verification_code'
  ) then
    -- audit_logs has no UPDATE privilege for anyone (incl. the owner) and a guard trigger: both are
    -- lifted for this one key-scoped statement only and restored before the transaction commits.
    grant update (changes) on public.audit_logs to postgres;
    alter table public.audit_logs disable trigger audit_logs_immutable;
    update public.audit_logs a
       set changes = a.changes || jsonb_build_object('verification_code', private.mask_changes(
             jsonb_build_object('verification_code', a.changes -> 'verification_code')) -> 'verification_code')
     where a.changes ? 'verification_code'
       and a.changes -> 'verification_code' is distinct from private.mask_changes(
             jsonb_build_object('verification_code', a.changes -> 'verification_code')) -> 'verification_code';
    alter table public.audit_logs enable trigger audit_logs_immutable;
    revoke update (changes) on public.audit_logs from postgres;
  end if;
end;
$$;
