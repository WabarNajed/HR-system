-- Request workflow engine: numbering, routing, approvals, idempotency, returns/resume, cancel, effects, SLA
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

-- helper: new attendance request (manager → HR) for the current user
create or replace function pg_temp.attendance_request(p_key text, p_date text) returns uuid language plpgsql as $$
declare
  v uuid;
begin
  v := public.create_request_draft(pg_temp.request_type('attendance'),
         jsonb_build_object('attendance_date', p_date, 'check_in_time', '08:05', 'reason', 'Forgot to check in'),
         'missing_check_in');
  perform pg_temp.set_id(p_key, v);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_year text := extract(year from private.org_today())::text;
  n1 text; n2 text;
  v_hr0 int; v_cert0 int;
begin
  -- numbering continues from the current sequence (the database may already hold real documents);
  -- FOR UPDATE keeps concurrent sessions from drawing numbers until this test transaction ends
  select coalesce(max(last_value), 0) into v_hr0 from (
    select s.last_value from public.document_sequences s where s.prefix = 'HR' and s.year = v_year::int for update) x;
  select coalesce(max(last_value), 0) into v_cert0 from (
    select s.last_value from public.document_sequences s where s.prefix = 'CERT' and s.year = v_year::int for update) x;
  perform pg_temp.as_user('emp1');
  perform pg_temp.attendance_request('r1', '2026-10-01');
  perform pg_temp.check('drafts have no request number yet',
    (select request_number from public.hr_requests where id = pg_temp.id('r1')) is null);
  perform public.submit_request(pg_temp.id('r1'));
  perform pg_temp.attendance_request('r2', '2026-10-02');
  perform public.submit_request(pg_temp.id('r2'));
  perform pg_temp.as_postgres();
  select request_number into n1 from public.hr_requests where id = pg_temp.id('r1');
  select request_number into n2 from public.hr_requests where id = pg_temp.id('r2');
  perform pg_temp.check('request numbers are HR-YYYY-NNNNNN formatted and sequential',
    n1 ~ ('^HR-' || v_year || '-\d{6}$')
    and n1 = 'HR-' || v_year || '-' || lpad((v_hr0 + 1)::text, 6, '0')
    and n2 = 'HR-' || v_year || '-' || lpad((v_hr0 + 2)::text, 6, '0'), n1 || ' / ' || n2 || ' after ' || v_hr0);

  perform pg_temp.as_user('hro');
  n1 := public.next_document_number('CERT');
  n2 := public.next_document_number('CERT');
  perform pg_temp.check('certificate numbers are CERT-YYYY-NNNNNN formatted and sequential',
    n1 ~ ('^CERT-' || v_year || '-\d{6}$')
    and n1 = 'CERT-' || v_year || '-' || lpad((v_cert0 + 1)::text, 6, '0')
    and n2 = 'CERT-' || v_year || '-' || lpad((v_cert0 + 2)::text, 6, '0'), n1 || ' / ' || n2 || ' after ' || v_cert0);
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('employees cannot draw certificate numbers', 'select public.next_document_number(''CERT'')', 'hr:errors.forbidden');
  perform pg_temp.throws('unknown number prefixes are rejected', 'select public.next_document_number(''XX'')', 'hr:errors.validation');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Manager → HR routing, approvals, idempotency
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  r1 uuid := pg_temp.id('r1');
  v  jsonb;
  v_approvals bigint;
begin
  perform pg_temp.check('submitted request waits for the direct manager',
    (select status = 'pending_manager_approval' and current_step_type = 'manager' and current_approver_id = pg_temp.id('mgr')
       and current_step_order = 1 from public.hr_requests where id = r1));
  perform pg_temp.check('manager was notified (approval_required) with request params',
    exists (select 1 from public.notifications where user_id = pg_temp.id('mgr') and type = 'approval_required'
            and entity_id = r1 and params ? 'request_number' and params ? 'request_type_name_ar'
            and params ? 'request_type_name_en' and params ? 'actor_name' and params ? 'status'));
  perform pg_temp.check('requester received a request_submitted confirmation',
    exists (select 1 from public.notifications where user_id = pg_temp.id('emp1') and type = 'request_submitted' and entity_id = r1));

  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('employee cannot approve own request', format('select public.act_on_request(%L, ''approve'')', r1), 'hr:errors.forbidden');
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('HR cannot approve on the manager''s behalf', format('select public.act_on_request(%L, ''approve'')', r1), 'hr:errors.forbidden');
  perform pg_temp.as_user('mgr');
  perform pg_temp.throws('reject requires a comment', format('select public.act_on_request(%L, ''reject'')', r1), 'hr:errors.commentRequired');
  perform pg_temp.throws('unknown actions are rejected', format('select public.act_on_request(%L, ''escalate'')', r1), 'hr:errors.validation');

  v := public.act_on_request(r1, 'approve', 'Looks fine');
  perform pg_temp.check('manager approval moves the request to HR review and returns {status, notification_ids}',
    v ->> 'status' = 'pending_hr_review' and jsonb_typeof(v -> 'notification_ids') = 'array'
    and jsonb_array_length(v -> 'notification_ids') >= 1);
  v_approvals := (select count(*) from public.request_approvals where request_id = r1);
  perform pg_temp.throws('acting twice on the same step fails', format('select public.act_on_request(%L, ''approve'')', r1), 'hr:errors.');
  perform pg_temp.check('the failed second approval left no trace',
    (select count(*) from public.request_approvals where request_id = r1) = v_approvals
    and (select count(*) from public.request_history where request_id = r1 and action = 'approve') = 1);
  perform pg_temp.check('manager still sees the request after deciding (previous approver)',
    pg_temp.cnt(format('select 1 from public.hr_requests where id = %L', r1)) = 1);
  perform pg_temp.as_postgres();

  perform pg_temp.check('HR queue notified: every active user with requests.approve except the requester',
    (select count(distinct user_id) from public.notifications where type = 'approval_required' and entity_id = r1
       and user_id in (pg_temp.id('hro'), pg_temp.id('hra'), pg_temp.id('sa'))) = 3);
  perform pg_temp.check('one pending HR approval row exists',
    (select count(*) from public.request_approvals where request_id = r1 and decision = 'pending' and step_type = 'hr') = 1);

  perform pg_temp.as_user('hro');
  v := public.act_on_request(r1, 'approve');
  perform pg_temp.check('final HR approval → approved', v ->> 'status' = 'approved'
    and (select status from public.hr_requests where id = r1) = 'approved');
  perform pg_temp.throws('approving an approved request fails cleanly', format('select public.act_on_request(%L, ''approve'')', r1),
    'hr:errors.invalidTransition');
  perform pg_temp.throws('complete requires approved/in_progress (reject now invalid)',
    format('select public.act_on_request(%L, ''reject'', ''late'')', r1), 'hr:errors.invalidTransition');
  v := public.act_on_request(r1, 'start');
  perform pg_temp.check('start → in_progress (assigned to the actor)',
    v ->> 'status' = 'in_progress' and (select assigned_to from public.hr_requests where id = r1) = pg_temp.id('hro'));
  v := public.act_on_request(r1, 'complete', 'Done');
  perform pg_temp.check('complete → completed with completed_at',
    v ->> 'status' = 'completed' and (select completed_at is not null from public.hr_requests where id = r1));
  perform pg_temp.throws('completed is final', format('select public.act_on_request(%L, ''cancel'')', r1), 'hr:errors.invalidTransition');
  perform pg_temp.as_postgres();

  perform pg_temp.check('history records every transition in order',
    (select array_agg(action order by created_at) from public.request_history where request_id = r1)
      = array['create', 'submit', 'approve', 'approve', 'start', 'complete']);
  perform pg_temp.check('request_approved / in_progress / completed notifications reached the requester',
    (select count(distinct type) from public.notifications where user_id = pg_temp.id('emp1') and entity_id = r1
       and type in ('request_approved', 'request_in_progress', 'request_completed')) = 3);
  perform pg_temp.check('every action was audited',
    (select count(*) from public.audit_logs where entity_type = 'hr_request' and entity_id = r1::text
       and action in ('request.create', 'request.submit', 'request.approve', 'request.start', 'request.complete')) = 6);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Visibility / authority of other managers and employees
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  r3 uuid;
begin
  perform pg_temp.as_user('emp3');
  r3 := pg_temp.attendance_request('r3', '2026-10-05');
  perform public.submit_request(r3);
  perform pg_temp.check('employee without a manager: manager step skipped with a history note → HR review',
    (select status from public.hr_requests where id = r3) = 'pending_hr_review');
  perform pg_temp.as_postgres();
  perform pg_temp.check('skip is recorded in history and approvals',
    exists (select 1 from public.request_history where request_id = r3 and action = 'skip' and metadata ->> 'reason' = 'no_manager')
    and exists (select 1 from public.request_approvals where request_id = r3 and decision = 'skipped' and step_type = 'manager'));

  perform pg_temp.as_user('mgr');
  perform pg_temp.throws('manager cannot approve a non-report''s request', format('select public.act_on_request(%L, ''approve'')', r3),
    'hr:errors.notFound');
  perform pg_temp.as_user('emp2');
  perform pg_temp.throws('another employee cannot cancel someone else''s request', format('select public.act_on_request(%L, ''cancel'')', r3),
    'hr:errors.notFound');
  perform pg_temp.throws('another employee cannot comment on someone else''s request',
    format('select public.add_request_comment(%L, ''hi'', false)', r3), 'hr:errors.notFound');
  perform pg_temp.as_user('emp3');
  perform pg_temp.throws('employees cannot write internal comments', format('select public.add_request_comment(%L, ''x'', true)', r3),
    'hr:errors.forbidden');
  perform pg_temp.throws('submitted requests are not editable', format('select public.update_request_draft(%L, ''{}'', null)', r3),
    'hr:errors.requestNotEditable');
  perform pg_temp.as_postgres();

  -- manager whose account is disabled → step skipped
  update public.profiles set status = 'disabled' where id = pg_temp.id('mgr');
  perform pg_temp.as_user('emp2');
  perform pg_temp.attendance_request('r_nomgr', '2026-10-06');
  perform public.submit_request(pg_temp.id('r_nomgr'));
  perform pg_temp.as_postgres();
  perform pg_temp.check('manager without an active account is skipped',
    (select status from public.hr_requests where id = pg_temp.id('r_nomgr')) = 'pending_hr_review'
    and exists (select 1 from public.request_history where request_id = pg_temp.id('r_nomgr') and action = 'skip'
                and metadata ->> 'reason' = 'manager_without_active_account'));
  update public.profiles set status = 'active' where id = pg_temp.id('mgr');
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Return for information → resume at the returning step
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  r4 uuid;
  r5 uuid;
  v  jsonb;
begin
  perform pg_temp.as_user('emp1');
  r4 := pg_temp.attendance_request('r4', '2026-10-07');
  perform public.submit_request(r4);
  perform pg_temp.as_user('mgr');
  perform public.act_on_request(r4, 'approve');
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('return requires a comment', format('select public.act_on_request(%L, ''return'')', r4), 'hr:errors.commentRequired');
  v := public.act_on_request(r4, 'return', 'Please attach the badge log');
  perform pg_temp.check('HR return → returned, remembering step 2',
    v ->> 'status' = 'returned'
    and (select returned_from_step_order from public.hr_requests where id = r4) = 2);
  perform pg_temp.as_postgres();
  perform pg_temp.check('requester notified with the HR comment (request_returned)',
    exists (select 1 from public.notifications where user_id = pg_temp.id('emp1') and type = 'request_returned'
            and params ->> 'comment' = 'Please attach the badge log'));

  perform pg_temp.as_user('emp1');
  perform public.update_request_draft(r4, jsonb_build_object('attendance_date', '2026-10-07', 'check_in_time', '08:10',
                                                             'reason', 'Badge reader was down'), 'missing_check_in');
  v := public.submit_request(r4);
  perform pg_temp.check('resubmission resumes at HR review (manager step not repeated)',
    v ->> 'status' = 'pending_hr_review'
    and (select current_step_order = 2 and returned_from_step_order is null from public.hr_requests where id = r4));
  perform pg_temp.as_postgres();
  perform pg_temp.check('resubmit recorded with the resume step; manager approved only once',
    exists (select 1 from public.request_history where request_id = r4 and action = 'resubmit' and (metadata ->> 'resume_step_order')::int = 2)
    and (select count(*) from public.request_approvals where request_id = r4 and step_type = 'manager' and decision = 'approved') = 1
    and (select count(*) from public.notifications where user_id = pg_temp.id('mgr') and type = 'approval_required' and entity_id = r4) = 1);
  perform pg_temp.check('request number kept on resubmission',
    (select request_number from public.hr_requests where id = r4) is not null
    and (select count(*) from public.request_history where request_id = r4 and action in ('submit', 'resubmit')) = 2);

  -- returned at the manager step → resumes at the manager step
  perform pg_temp.as_user('emp1');
  r5 := pg_temp.attendance_request('r5', '2026-10-08');
  perform public.submit_request(r5);
  perform pg_temp.as_user('mgr');
  perform public.act_on_request(r5, 'return', 'Which day exactly?');
  perform pg_temp.as_user('emp1');
  v := public.submit_request(r5);
  perform pg_temp.check('returned at manager step resumes with the manager',
    v ->> 'status' = 'pending_manager_approval'
    and (select current_approver_id from public.hr_requests where id = r5) = pg_temp.id('mgr'));
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Reassign, cancel, drafts
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  r5 uuid := pg_temp.id('r5');
  r4 uuid := pg_temp.id('r4');
  v  jsonb;
  v_draft uuid;
begin
  -- HR reassigns the manager step to the HR admin; the original manager loses authority
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('cannot assign to the requester', format('select public.act_on_request(%L, ''reassign'', null, %L)', r5, pg_temp.id('emp1')),
    'hr:errors.invalidAssignee');
  perform public.act_on_request(r5, 'reassign', 'Manager on leave', pg_temp.id('hra'));
  perform pg_temp.as_user('mgr');
  perform pg_temp.throws('previous approver can no longer act after reassignment', format('select public.act_on_request(%L, ''approve'')', r5),
    'hr:errors.forbidden');
  perform pg_temp.as_user('hra');
  v := public.act_on_request(r5, 'approve');
  perform pg_temp.check('reassigned approver can approve', v ->> 'status' = 'pending_hr_review');
  perform pg_temp.as_postgres();
  perform pg_temp.check('reassignment recorded (reassigned row + request_assigned notification)',
    exists (select 1 from public.request_approvals where request_id = r5 and decision = 'reassigned')
    and exists (select 1 from public.notifications where user_id = pg_temp.id('hra') and type = 'request_assigned' and entity_id = r5));

  -- HR step assignment
  perform pg_temp.as_user('hra');
  perform public.act_on_request(r4, 'reassign', null, pg_temp.id('hro'));
  perform pg_temp.check('HR step reassignment sets assigned_to', (select assigned_to from public.hr_requests where id = r4) = pg_temp.id('hro'));
  perform pg_temp.throws('HR step cannot be assigned to a non-HR user', format('select public.act_on_request(%L, ''reassign'', null, %L)', r4, pg_temp.id('emp2')),
    'hr:errors.invalidAssignee');

  -- cancellation rules
  perform pg_temp.as_user('emp1');
  v := public.act_on_request(r5, 'cancel', 'No longer needed');
  perform pg_temp.check('requester can cancel a pending request', v ->> 'status' = 'cancelled'
    and (select cancelled_at is not null from public.hr_requests where id = r5));
  perform pg_temp.as_user('hro');
  perform public.act_on_request(r4, 'approve');
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('requester cannot cancel an approved request', format('select public.act_on_request(%L, ''cancel'')', r4),
    'hr:errors.invalidTransition');
  perform pg_temp.as_user('hro');
  v := public.act_on_request(r4, 'cancel', 'Duplicate');
  perform pg_temp.check('HR can cancel an approved request', v ->> 'status' = 'cancelled');

  -- drafts: private to the requester, deletable, not editable by others
  perform pg_temp.as_user('emp1');
  v_draft := public.create_request_draft(pg_temp.request_type('other'), '{"subject": "Draft"}', null);
  perform pg_temp.as_user('hro');
  perform pg_temp.check('HR does not see other people''s drafts', pg_temp.cnt(format('select 1 from public.hr_requests where id = %L', v_draft)) = 0);
  perform pg_temp.throws('others cannot edit a draft', format('select public.update_request_draft(%L, ''{}'', null)', v_draft), 'hr:errors.forbidden');
  perform pg_temp.check('others cannot delete a draft', pg_temp.affected(format('delete from public.hr_requests where id = %L', v_draft)) = 0);
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('submit validates required fields (details missing)', format('select public.submit_request(%L)', v_draft),
    'hr:errors.requiredFieldMissing');
  perform pg_temp.check('requester can delete own draft', pg_temp.affected(format('delete from public.hr_requests where id = %L', v_draft)) = 1);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Dynamic form validation (visibility rules, options, unknown keys)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v uuid;
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('unknown field keys are rejected',
    format('select public.create_request_draft(%L, ''{"hacker_field": 1}'', null)', pg_temp.request_type('other')), 'hr:errors.validation');
  perform pg_temp.throws('invalid subtype is rejected',
    format('select public.create_request_draft(%L, ''{}'', ''nope'')', pg_temp.request_type('iqama_visa')), 'hr:errors.validation');
  perform pg_temp.throws('invalid dropdown option is rejected',
    format('select public.create_request_draft(%L, ''{"language": "fr"}'', ''salary'')', pg_temp.request_type('certificate')), 'hr:errors.validation');
  perform pg_temp.throws('invalid date is rejected',
    format('select public.create_request_draft(%L, ''{"attendance_date": "31/31/2026"}'', ''missing_check_in'')', pg_temp.request_type('attendance')),
    'hr:errors.validation');

  v := public.create_request_draft(pg_temp.request_type('iqama_visa'), '{"details": "Renew please"}', 'iqama_renewal');
  perform public.submit_request(v);
  perform pg_temp.check('hidden required fields are not required (iqama renewal has no travel date)',
    (select status from public.hr_requests where id = v) = 'pending_hr_review');
  v := public.create_request_draft(pg_temp.request_type('iqama_visa'), '{"details": "Leaving"}', 'final_exit');
  perform pg_temp.throws('visible required fields are enforced (final exit needs travel_date)', format('select public.submit_request(%L)', v),
    'hr:errors.requiredFieldMissing');
  v := public.create_request_draft(pg_temp.request_type('business_trip'),
         '{"destination_city": "Dubai", "country": "UAE", "start_date": "2026-10-11", "end_date": "2026-10-12", "purpose": "Expo", "advance_required": true}', null);
  perform pg_temp.throws('boolean-driven visibility (advance amount required when advance requested)', format('select public.submit_request(%L)', v),
    'hr:errors.requiredFieldMissing');
  perform public.update_request_draft(v,
         '{"destination_city": "Dubai", "country": "UAE", "start_date": "2026-10-11", "end_date": "2026-10-12", "purpose": "Expo", "advance_required": false}', null);
  perform public.submit_request(v);
  perform pg_temp.check('…and not required once advance is not requested',
    (select status from public.hr_requests where id = v) = 'pending_manager_approval');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Effects on final approval: bank update, employee information update
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v uuid;
  v_hist jsonb;
begin
  perform pg_temp.as_user('emp2');
  v := public.create_request_draft(pg_temp.request_type('bank_update'),
         '{"bank_name": "Riyad Bank", "iban": "sa44 2000 0001 2345 6789 1234", "account_holder": "Employee Two"}', null);
  perform pg_temp.throws('bank update needs the IBAN certificate attachment', format('select public.submit_request(%L)', v),
    'hr:errors.requiredFieldMissing');
  insert into public.request_attachments (request_id, field_key, storage_path, file_name)
  values (v, 'iban_certificate', 'requests/' || v || '/' || gen_random_uuid() || '-iban.pdf', 'iban.pdf');
  perform public.submit_request(v);
  perform pg_temp.check('bank data is NOT changed before approval',
    (select iban from public.employee_bank_accounts where employee_id = pg_temp.id('e_emp2') and is_primary) = 'SA0380000000608010167519');
  perform pg_temp.as_user('hra');
  perform public.act_on_request(v, 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approval updates the primary bank account (normalised IBAN)',
    (select iban = 'SA4420000001234567891234' and bank_name = 'Riyad Bank' and account_holder = 'Employee Two'
       from public.employee_bank_accounts where employee_id = pg_temp.id('e_emp2') and is_primary));
  select metadata -> 'effects' into v_hist from public.request_history where request_id = v and action = 'approve';
  perform pg_temp.check('history keeps old/new bank values with the IBAN masked',
    v_hist -> 'bank_account' -> 'iban' ->> 'new' = '****1234' and v_hist -> 'bank_account' -> 'iban' ->> 'old' = '****7519'
    and v_hist -> 'bank_account' -> 'bank_name' ->> 'old' = 'Test Bank');

  perform pg_temp.as_user('emp2');
  v := public.create_request_draft(pg_temp.request_type('employee_info_update'),
         '{"current_value": "-", "requested_value": "0555000111", "reason": "New number"}', 'mobile');
  perform public.submit_request(v);
  perform pg_temp.as_user('hro');
  perform public.act_on_request(v, 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approved mobile update is applied to the employee record',
    (select mobile from public.employees where id = pg_temp.id('e_emp2')) = '0555000111');
  perform pg_temp.check('history keeps old/new employee values',
    (select metadata -> 'effects' -> 'employee' -> 'changes' -> 'mobile' ->> 'new' from public.request_history
      where request_id = v and action = 'approve') = '0555000111');

  perform pg_temp.as_user('emp2');
  v := public.create_request_draft(pg_temp.request_type('employee_info_update'),
         '{"passport_number": "X1234567", "passport_expiry": "2031-05-01", "reason": "Renewed"}', 'passport');
  perform public.submit_request(v);
  perform pg_temp.as_user('hro');
  perform public.act_on_request(v, 'approve');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approved passport update sets number and expiry',
    (select passport_number = 'X1234567' and passport_expiry_date = date '2031-05-01' from public.employees where id = pg_temp.id('e_emp2')));

  perform pg_temp.as_user('emp2');
  perform pg_temp.throws('email updates must be valid e-mail addresses',
    format('select public.submit_request(public.create_request_draft(%L, ''{"requested_value": "not-an-email", "reason": "x"}'', ''email''))',
           pg_temp.request_type('employee_info_update')), 'hr:errors.validation');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- SLA: business-day math (Sun–Thu working week, Fri/Sat weekend, public holidays)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v uuid;
begin
  perform pg_temp.check('Thursday + 1 business day = Sunday (weekend skipped)',
    private.add_business_days(date '2026-10-01', 1) = date '2026-10-04');
  perform pg_temp.check('Thursday + 2 business days = Monday', private.add_business_days(date '2026-10-01', 2) = date '2026-10-05');
  perform pg_temp.check('Friday + 0 business days = next Sunday', private.add_business_days(date '2026-10-02', 0) = date '2026-10-04');
  insert into public.public_holidays (name_ar, name_en, start_date, end_date) values ('عطلة', 'Holiday', '2026-10-04', '2026-10-05');
  perform pg_temp.check('public holidays are skipped (Thu + 2 over a Sun–Mon holiday = Wednesday)',
    private.add_business_days(date '2026-10-01', 2) = date '2026-10-07');
  update public.public_holidays set is_active = false where start_date = '2026-10-04';
  perform pg_temp.check('inactive holidays are ignored', private.add_business_days(date '2026-10-01', 2) = date '2026-10-05');
  perform pg_temp.check('SLA deadline is the end of the working day in the org timezone',
    private.sla_due_at(timestamptz '2026-10-01 10:00+03', 2) = timestamptz '2026-10-05 17:00+03');

  perform pg_temp.as_user('emp1');
  v := public.create_request_draft(pg_temp.request_type('other'), '{"subject": "S", "details": "D"}', null);
  perform public.submit_request(v);
  perform pg_temp.as_postgres();
  perform pg_temp.check('submitted request due_at = submitted_at + request type SLA (5 business days)',
    (select due_at = private.sla_due_at(submitted_at, 5) from public.hr_requests where id = v));
  perform pg_temp.check('workflow panel lists resolved steps with state',
    (select count(*) from public.get_request_workflow(v)) = 0); -- postgres (no auth.uid) cannot view
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('workflow panel (requester view) shows the current HR step',
    (select state from public.get_request_workflow(v) where step_order = 1) = 'current');
  perform pg_temp.as_postgres();
end;
$$;

-- the hr_requests policy (set-based) and private.can_view_request (per request, used by RPCs/storage)
-- must agree for every user and every request
do $$
declare
  k text;
  v_bad bigint;
begin
  foreach k in array array['sa', 'hra', 'hro', 'mgr', 'emp1', 'emp2', 'emp3', 'pend', 'dis'] loop
    perform pg_temp.as_postgres();
    create temp table if not exists all_requests (id uuid);
    truncate all_requests;
    insert into all_requests select id from public.hr_requests;
    grant select on all_requests to authenticated;
    perform pg_temp.as_user(k);
    select count(*) into v_bad from all_requests a
    where exists (select 1 from public.hr_requests r where r.id = a.id) is distinct from private.can_view_request(a.id);
    perform pg_temp.check(k || ': table policy and can_view_request agree on every request', v_bad = 0, v_bad || ' mismatches');
  end loop;
  perform pg_temp.as_postgres();
end;
$$;

select pg_temp.finish('03_requests_workflow');
rollback;
