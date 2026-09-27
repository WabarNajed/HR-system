-- Leave: day counting and the balance-effect state machine (no double deduction)
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

create or replace function pg_temp.leave_draft(p_key text, p_code text, p_start text, p_end text) returns uuid language plpgsql as $$
declare
  v uuid;
begin
  v := public.create_request_draft(pg_temp.request_type('leave'),
         jsonb_build_object('leave_type', pg_temp.leave_type(p_code), 'start_date', p_start, 'end_date', p_end,
                            'reason', 'Personal'), null);
  perform pg_temp.set_id(p_key, v);
  return v;
end;
$$;

-- balance snapshot for emp1 / annual / 2026: 'pending|used|remaining'
create or replace function pg_temp.bal(p_emp text default 'e_emp1', p_code text default 'annual', p_year int default 2026)
returns text language sql as $$
  select coalesce((select trim(to_char(pending, 'FM990.00')) || '|' || trim(to_char(used, 'FM990.00')) || '|' || trim(to_char(remaining, 'FM990.00'))
                   from public.leave_balances b
                   where b.employee_id = pg_temp.id(p_emp) and b.leave_type_id = pg_temp.leave_type(p_code) and b.year = p_year), 'none');
$$;

create or replace function pg_temp.effect(p_key text) returns text language sql as $$
  select balance_effect from public.leave_requests where request_id = pg_temp.id(p_key);
$$;

-- ---------------------------------------------------------------------------------------------------
-- count_leave_days
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('working basis skips Fri/Sat (Thu 1 Oct → Wed 7 Oct = 5 days)',
    public.count_leave_days(pg_temp.leave_type('annual'), '2026-10-01', '2026-10-07') = 5);
  perform pg_temp.check('calendar basis counts every day (sick leave, 7 days)',
    public.count_leave_days(pg_temp.leave_type('sick'), '2026-10-01', '2026-10-07') = 7);
  perform pg_temp.check('end before start counts 0', public.count_leave_days(pg_temp.leave_type('annual'), '2026-10-07', '2026-10-01') = 0);
  perform pg_temp.as_postgres();
  insert into public.public_holidays (name_ar, name_en, start_date, end_date) values ('اليوم الوطني', 'National Day', '2026-10-05', '2026-10-05');
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('working basis skips active public holidays (5 → 4)',
    public.count_leave_days(pg_temp.leave_type('annual'), '2026-10-01', '2026-10-07') = 4);
  perform pg_temp.check('calendar basis ignores public holidays',
    public.count_leave_days(pg_temp.leave_type('sick'), '2026-10-01', '2026-10-07') = 7);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- submit → manager → HR approve → cancel after approval
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.check('no balance row before the first leave request', pg_temp.bal() = 'none');
  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L1', 'annual', '2026-11-01', '2026-11-05');
  perform pg_temp.check('drafts have no balance effect', pg_temp.bal() = 'none');
  perform public.submit_request(pg_temp.id('L1'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('submit auto-creates the balance (21 days) and holds 5 days as pending',
    pg_temp.bal() = '5.00|0.00|21.00' and pg_temp.effect('L1') = 'pending');
  perform pg_temp.check('computed days stored on the request values and leave row',
    (select value from public.hr_request_values where request_id = pg_temp.id('L1') and field_key = 'days') = '5'::jsonb
    and (select days from public.leave_requests where request_id = pg_temp.id('L1')) = 5
    and (select return_date from public.leave_requests where request_id = pg_temp.id('L1')) = date '2026-11-08');

  perform pg_temp.as_user('mgr');
  perform public.act_on_request(pg_temp.id('L1'), 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('manager approval keeps the hold pending (HR step left)', pg_temp.bal() = '5.00|0.00|21.00');

  perform pg_temp.as_user('hro');
  perform public.act_on_request(pg_temp.id('L1'), 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('final approval: pending → used (remaining 16)', pg_temp.bal() = '0.00|5.00|16.00' and pg_temp.effect('L1') = 'used');

  perform pg_temp.as_user('hro');
  perform pg_temp.throws('approving twice is rejected', format('select public.act_on_request(%L, ''approve'')', pg_temp.id('L1')),
    'hr:errors.invalidTransition');
  perform pg_temp.as_postgres();
  perform pg_temp.check('no double deduction after the repeated approval', pg_temp.bal() = '0.00|5.00|16.00');

  perform pg_temp.as_user('hro');
  perform public.act_on_request(pg_temp.id('L1'), 'cancel', 'Trip cancelled');
  perform pg_temp.as_postgres();
  perform pg_temp.check('cancel after approval returns the used days (remaining 21)',
    pg_temp.bal() = '0.00|0.00|21.00' and pg_temp.effect('L1') = 'reversed');
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('cancelling twice is rejected', format('select public.act_on_request(%L, ''cancel'')', pg_temp.id('L1')),
    'hr:errors.invalidTransition');
  perform pg_temp.as_postgres();
  perform pg_temp.check('no double reversal', pg_temp.bal() = '0.00|0.00|21.00');
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- reject, cancel before approval, return + resubmit with new dates
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L2', 'annual', '2026-11-08', '2026-11-09');
  perform public.submit_request(pg_temp.id('L2'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('second request holds 2 days', pg_temp.bal() = '2.00|0.00|21.00');
  perform pg_temp.as_user('mgr');
  perform public.act_on_request(pg_temp.id('L2'), 'reject', 'Peak period');
  perform pg_temp.as_postgres();
  perform pg_temp.check('rejection releases the hold', pg_temp.bal() = '0.00|0.00|21.00' and pg_temp.effect('L2') = 'reversed');

  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L3', 'annual', '2026-11-08', '2026-11-09');
  perform public.submit_request(pg_temp.id('L3'));
  perform pg_temp.check('rejected requests do not block the same dates', true);
  perform public.act_on_request(pg_temp.id('L3'), 'cancel');
  perform pg_temp.as_postgres();
  perform pg_temp.check('cancel before approval releases the hold', pg_temp.bal() = '0.00|0.00|21.00' and pg_temp.effect('L3') = 'reversed');

  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L4', 'annual', '2026-11-22', '2026-11-23');
  perform public.submit_request(pg_temp.id('L4'));
  perform pg_temp.as_user('mgr');
  perform public.act_on_request(pg_temp.id('L4'), 'approve');
  perform pg_temp.as_user('hro');
  perform public.act_on_request(pg_temp.id('L4'), 'return', 'Please extend to include Tuesday or confirm');
  perform pg_temp.as_postgres();
  perform pg_temp.check('return releases the hold (effect back to none)', pg_temp.bal() = '0.00|0.00|21.00' and pg_temp.effect('L4') = 'none');
  perform pg_temp.as_user('emp1');
  perform public.update_request_draft(pg_temp.id('L4'),
    jsonb_build_object('leave_type', pg_temp.leave_type('annual'), 'start_date', '2026-11-22', 'end_date', '2026-11-24', 'reason', 'Updated'), null);
  perform public.submit_request(pg_temp.id('L4'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('resubmission holds the new day count (3) and resumes at HR',
    pg_temp.bal() = '3.00|0.00|21.00' and pg_temp.effect('L4') = 'pending'
    and (select status from public.hr_requests where id = pg_temp.id('L4')) = 'pending_hr_review');
  perform pg_temp.as_user('hro');
  perform public.act_on_request(pg_temp.id('L4'), 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approval after resubmission deducts exactly once', pg_temp.bal() = '0.00|3.00|18.00');
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- validations
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L5', 'annual', '2026-12-06', '2026-12-27');
  perform public.submit_request(pg_temp.id('L5'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('16-day request held (available 18 → 2)', pg_temp.bal() = '16.00|3.00|18.00');

  perform pg_temp.as_user('emp1');
  perform pg_temp.leave_draft('L6', 'annual', '2026-12-28', '2026-12-31');
  perform pg_temp.throws('pending holds count against availability (4 > 2 available)',
    format('select public.submit_request(%L)', pg_temp.id('L6')), 'hr:errors.insufficientBalance');
  perform pg_temp.leave_draft('L7', 'annual', '2027-04-01', '2027-06-30');
  perform pg_temp.throws('requests above the balance are rejected', format('select public.submit_request(%L)', pg_temp.id('L7')),
    'hr:errors.insufficientBalance');
  perform pg_temp.leave_draft('L8', 'annual', '2026-12-10', '2026-12-13');
  perform pg_temp.throws('overlapping leave is rejected', format('select public.submit_request(%L)', pg_temp.id('L8')),
    'hr:errors.overlappingLeave');
  perform pg_temp.leave_draft('L9', 'maternity', '2027-02-01', '2027-02-10');
  perform pg_temp.throws('gender restriction enforced (maternity for a male employee)', format('select public.submit_request(%L)', pg_temp.id('L9')),
    'hr:errors.leaveGenderRestricted');
  perform pg_temp.leave_draft('L10', 'marriage', '2027-02-01', '2027-02-06');
  perform pg_temp.throws('max days per request enforced (marriage > 5)', format('select public.submit_request(%L)', pg_temp.id('L10')),
    'hr:errors.leaveMaxDaysExceeded');
  perform pg_temp.leave_draft('L11', 'annual', '2027-02-05', '2027-02-06');
  perform pg_temp.throws('a range with no working days is rejected', format('select public.submit_request(%L)', pg_temp.id('L11')),
    'hr:errors.invalidDateRange');
  perform pg_temp.leave_draft('L12', 'annual', '2027-02-10', '2027-02-01');
  perform pg_temp.throws('end before start is rejected', format('select public.submit_request(%L)', pg_temp.id('L12')),
    'hr:errors.invalidDateRange');
  perform pg_temp.leave_draft('L13', 'sick', '2027-03-01', '2027-03-03');
  perform pg_temp.throws('sick leave requires an attachment', format('select public.submit_request(%L)', pg_temp.id('L13')),
    'hr:errors.attachmentRequired');
  insert into public.request_attachments (request_id, field_key, storage_path, file_name)
  values (pg_temp.id('L13'), 'attachment', 'requests/' || pg_temp.id('L13') || '/' || gen_random_uuid() || '-report.pdf', 'report.pdf');
  perform public.submit_request(pg_temp.id('L13'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('non-deducting leave (sick) has no balance effect',
    pg_temp.effect('L13') = 'none' and pg_temp.bal('e_emp1', 'sick', 2027) = 'none');
  perform pg_temp.as_user('mgr');
  perform public.act_on_request(pg_temp.id('L13'), 'approve');
  perform pg_temp.as_user('hro');
  perform public.act_on_request(pg_temp.id('L13'), 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approving non-deducting leave does not touch balances',
    pg_temp.effect('L13') = 'none' and pg_temp.bal('e_emp1', 'sick', 2027) = 'none'
    and pg_temp.bal() = '16.00|3.00|18.00');

  perform pg_temp.as_user('emp2');
  perform pg_temp.leave_draft('L14', 'maternity', '2027-02-01', '2027-02-10');
  insert into public.request_attachments (request_id, field_key, storage_path, file_name)
  values (pg_temp.id('L14'), 'attachment', 'requests/' || pg_temp.id('L14') || '/' || gen_random_uuid() || '-cert.pdf', 'cert.pdf');
  perform public.submit_request(pg_temp.id('L14'));
  perform pg_temp.check('maternity leave accepted for a female employee',
    (select status from public.hr_requests where id = pg_temp.id('L14')) = 'pending_manager_approval');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- adjustments and direct balance edits
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_adj uuid;
  v_n   int;
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('employees cannot adjust balances',
    format('select public.adjust_leave_balance(%L, %L, 2026, 5, ''gift'')', pg_temp.id('e_emp1'), pg_temp.leave_type('annual')), 'hr:errors.forbidden');
  perform pg_temp.throws('employees cannot set balances',
    format('select public.set_leave_balance(%L, %L, 2026, 50)', pg_temp.id('e_emp1'), pg_temp.leave_type('annual')), 'hr:errors.forbidden');
  perform pg_temp.check('employees cannot edit balances directly',
    pg_temp.affected(format('update public.leave_balances set opening_balance = 99 where employee_id = %L', pg_temp.id('e_emp1'))) = 0);
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('adjustments need a reason',
    format('select public.adjust_leave_balance(%L, %L, 2026, 2, '' '')', pg_temp.id('e_emp1'), pg_temp.leave_type('annual')), 'hr:errors.reasonRequired');
  v_adj := public.adjust_leave_balance(pg_temp.id('e_emp1'), pg_temp.leave_type('annual'), 2026, 2, 'Carry-over approved by HR');
  perform pg_temp.throws('used/pending cannot be edited directly (RPC only)',
    format('update public.leave_balances set used = 0 where employee_id = %L', pg_temp.id('e_emp1')), 'permission denied');
  perform pg_temp.check('HR can set opening balance / entitlement directly (imports)',
    pg_temp.affected(format('update public.leave_balances set opening_balance = 1 where employee_id = %L and year = 2026 and leave_type_id = %L',
                            pg_temp.id('e_emp1'), pg_temp.leave_type('annual'))) = 1);
  perform public.set_leave_balance(pg_temp.id('e_emp2'), pg_temp.leave_type('annual'), 2026, 4.5, 30);
  perform pg_temp.check('set_leave_balance creates/sets opening balance + entitlement (import path)',
    pg_temp.bal('e_emp2') = '0.00|0.00|34.50');
  v_n := public.initialize_leave_balances(2027);
  perform pg_temp.as_postgres();
  perform pg_temp.check('adjustment recorded with old/new remaining',
    (select old_remaining = 18 and new_remaining = 20 and amount = 2 and changed_by = pg_temp.id('hro')
       from public.leave_adjustments where id = v_adj));
  perform pg_temp.check('balance reflects adjustment + opening balance (remaining 21)', pg_temp.bal() = '16.00|3.00|21.00');
  perform pg_temp.check('adjustment audited and employee notified',
    exists (select 1 from public.audit_logs where action = 'leave_adjustment.create' and employee_id = pg_temp.id('e_emp1'))
    and exists (select 1 from public.notifications where user_id = pg_temp.id('emp1') and type = 'leave_balance_adjusted'));
  perform pg_temp.check('initialize_leave_balances creates missing deducting balances for every active employee (6 × annual/emergency, minus existing)',
    v_n = (select count(*) from public.leave_balances where year = 2027 and leave_type_id in (pg_temp.leave_type('annual'), pg_temp.leave_type('emergency')))
    and (select count(*) from public.leave_balances where year = 2027 and leave_type_id = pg_temp.leave_type('annual')) = 6);
  perform pg_temp.check('invariants hold: pending/used never negative',
    not exists (select 1 from public.leave_balances where pending < 0 or used < 0));
end;
$$;

select pg_temp.finish('04_leave');
rollback;
