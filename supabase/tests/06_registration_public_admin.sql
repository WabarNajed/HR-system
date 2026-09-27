-- Registration hook + review RPCs, public RPCs, global search, dashboard, e-mail claim, expiry alerts,
-- template versioning, organization reset
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

-- ---------------------------------------------------------------------------------------------------
-- Self registration (auth.users insert trigger) and review
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_reg  uuid := gen_random_uuid();
  v_inv  uuid := gen_random_uuid();
  v_reg2 uuid := gen_random_uuid();
  v_p    public.profiles;
begin
  perform pg_temp.new_employee('e_new', 'T-NEW', 'موظف جديد', 'e_mgr', 'male');
  perform pg_temp.set_id('reg', v_reg);
  perform pg_temp.set_id('reg2', v_reg2);
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_reg, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'New.Joiner@Test.Local',
          '{"provider": "email"}',
          '{"full_name": "New Joiner", "mobile": "0501234567", "employee_number": "t-new", "status": "active", "roles": ["super_admin"], "invited_by_admin": true}',
          now(), now());
  select * into v_p from public.profiles where id = v_reg;
  perform pg_temp.check('self sign-up creates a pending profile with registration data copied',
    v_p.status = 'pending' and v_p.full_name = 'New Joiner' and v_p.mobile = '0501234567'
    and v_p.registration_employee_number = 't-new' and v_p.email = 'new.joiner@test.local');
  perform pg_temp.check('user_metadata never grants status or roles',
    v_p.status = 'pending' and not exists (select 1 from public.user_roles where user_id = v_reg) and v_p.invited_at is null);
  perform pg_temp.check('registration input matched to the unlinked employee (employee_number, case-insensitive)',
    v_p.matched_employee_id = pg_temp.id('e_new'));
  perform pg_temp.check('registration reviewers (users.approve) were notified, HR officer was not',
    exists (select 1 from public.notifications where type = 'registration_submitted' and entity_id = v_reg and user_id = pg_temp.id('hra'))
    and exists (select 1 from public.notifications where type = 'registration_submitted' and entity_id = v_reg and user_id = pg_temp.id('sa'))
    and not exists (select 1 from public.notifications where type = 'registration_submitted' and entity_id = v_reg and user_id = pg_temp.id('hro')));

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_reg2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'someone@test.local',
          '{"provider": "email"}', '{"full_name": "Someone", "employee_number": "NID-T-003"}', now(), now());
  perform pg_temp.check('national ID input does not suggest an employee that already has an account',
    (select matched_employee_id from public.profiles where id = v_reg2) is null);

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_inv, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited@test.local',
          '{"provider": "email", "invited_by_admin": true}', '{"full_name": "Invited Person"}', now(), now());
  perform pg_temp.check('admin-provisioned user (app_metadata.invited_by_admin) starts active without roles',
    (select status = 'active' and invited_at is not null from public.profiles where id = v_inv)
    and not exists (select 1 from public.user_roles where user_id = v_inv));

  update auth.users set email = 'changed@test.local' where id = v_inv;
  perform pg_temp.check('auth e-mail changes are synced to the profile', (select email from public.profiles where id = v_inv) = 'changed@test.local');

  -- review flow
  perform pg_temp.as_user('reg');
  perform pg_temp.check('applicant can update registration details while pending',
    pg_temp.affected(format('update public.profiles set registration_note = ''I joined last week'' where id = %L', v_reg)) = 1);
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('HR officer (no users perms) cannot approve registrations',
    format('select public.approve_registration(%L, %L)', v_reg, pg_temp.id('e_new')), 'hr:errors.forbidden');
  perform pg_temp.as_user('hra');
  perform pg_temp.throws('information requests need a note', format('select public.request_registration_info(%L, '''')', v_reg), 'hr:errors.reasonRequired');
  perform public.request_registration_info(v_reg, 'Please provide your iqama number');
  perform pg_temp.as_postgres();
  perform pg_temp.check('info requested: status + note stored, applicant notified',
    (select status = 'info_requested' and review_note = 'Please provide your iqama number' from public.profiles where id = v_reg)
    and exists (select 1 from public.notifications where user_id = v_reg and type = 'registration_info_requested'));
  perform pg_temp.as_user('reg');
  perform pg_temp.check('applicant sees own profile (with the note) while not active',
    pg_temp.cnt('select 1 from public.profiles where review_note is not null') = 1);
  perform pg_temp.affected(format('update public.profiles set registration_employee_number = ''NID-T-NEW'' where id = %L', v_reg));
  perform pg_temp.as_postgres();
  perform pg_temp.check('answering the information request re-opens the registration and re-notifies reviewers',
    (select status from public.profiles where id = v_reg) = 'pending'
    and (select count(*) from public.notifications where type = 'registration_submitted' and entity_id = v_reg and user_id = pg_temp.id('hra')) = 2);

  perform pg_temp.as_user('hra');
  perform pg_temp.throws('hr_admin cannot approve a registration as super_admin',
    format('select public.approve_registration(%L, null, ''super_admin'')', v_reg), 'hr:errors.forbidden');
  perform pg_temp.throws('cannot link an employee that already has an account',
    format('select public.approve_registration(%L, %L)', v_reg, pg_temp.id('e_emp1')), 'hr:errors.employeeAlreadyLinked');
  perform public.approve_registration(v_reg, pg_temp.id('e_new'), 'employee');
  perform pg_temp.as_postgres();
  perform pg_temp.check('approval activates, links the employee and assigns the role',
    (select status = 'active' and employee_id = pg_temp.id('e_new') and reviewed_by = pg_temp.id('hra') from public.profiles where id = v_reg)
    and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = v_reg and r.key = 'employee'));
  perform pg_temp.check('approval audited and applicant notified',
    exists (select 1 from public.audit_logs where action = 'registration.approve' and entity_id = v_reg::text)
    and exists (select 1 from public.notifications where user_id = v_reg and type = 'registration_approved'));
  perform pg_temp.as_user('reg');
  perform pg_temp.check('approved user now sees their employee record', pg_temp.cnt('select 1 from public.employees') = 1);
  perform pg_temp.as_user('hra');
  perform pg_temp.throws('rejection needs a reason', format('select public.reject_registration(%L, null)', v_reg2), 'hr:errors.reasonRequired');
  perform public.reject_registration(v_reg2, 'Not an employee of the company');
  perform pg_temp.throws('approved registrations cannot be rejected afterwards', format('select public.reject_registration(%L, ''x'')', v_reg),
    'hr:errors.invalidTransition');
  perform pg_temp.as_postgres();
  perform pg_temp.check('rejected registration stores the reason and notifies the applicant',
    (select status = 'rejected' and review_note = 'Not an employee of the company' from public.profiles where id = v_reg2)
    and exists (select 1 from public.notifications where user_id = v_reg2 and type = 'registration_rejected'));
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Public certificate verification
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_json jsonb;
begin
  insert into public.certificates (certificate_number, employee_id, certificate_type, language, issue_date, status)
  values ('CERT-2026-000777', pg_temp.id('e_emp1'), 'salary', 'bilingual', '2026-09-01', 'valid'),
         ('CERT-2026-000778', pg_temp.id('e_emp1'), 'employment', 'en', '2026-09-02', 'revoked');
  perform pg_temp.as_anon();
  select to_jsonb(v) into v_json from public.verify_certificate(' cert-2026-000777 ') v;
  perform pg_temp.check('anon verifies a certificate (trimmed, case-insensitive)', v_json ->> 'status' = 'valid'
    and v_json ->> 'certificate_type' = 'salary' and v_json ->> 'issue_date' = '2026-09-01'
    and v_json ->> 'employee_name' = 'موظف أول / EN T-001');
  perform pg_temp.check('verification output has exactly the 5 public fields',
    (select array_agg(k order by k) from jsonb_object_keys(v_json) k)
      = array['certificate_number', 'certificate_type', 'employee_name', 'issue_date', 'status']);
  perform pg_temp.check('revoked certificates verify as revoked (English name for English certificates)',
    (select status = 'revoked' and employee_name = 'EN T-001' from public.verify_certificate('CERT-2026-000778')));
  perform pg_temp.check('verification does not leak salary / national ID / IBAN anywhere in the output',
    v_json::text !~ '(10000|12500|NID-|SA03|T-001\b)');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Global search (security invoker — RLS applies)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_num text;
begin
  perform pg_temp.as_user('emp1');
  perform public.submit_request(public.create_request_draft(pg_temp.request_type('other'), '{"subject": "S", "details": "D"}', null));
  select request_number into v_num from public.hr_requests where requester_id = pg_temp.id('emp1') and request_number is not null limit 1;
  perform pg_temp.check('employee finds own request by number', exists (select 1 from public.global_search(v_num) where kind = 'request'));
  perform pg_temp.check('employee does not find other employees', not exists (select 1 from public.global_search('T-002')));
  perform pg_temp.as_user('mgr');
  perform pg_temp.check('manager finds a direct report by employee number', exists (select 1 from public.global_search('T-001') where kind = 'employee'));
  perform pg_temp.check('manager does not find other teams', not exists (select 1 from public.global_search('T-003')));
  perform pg_temp.check('national ID matches are hidden without personal_data.view', not exists (select 1 from public.global_search('NID-T-001')));
  perform pg_temp.as_user('hro');
  perform pg_temp.check('HR with personal_data.view finds an employee by national ID',
    exists (select 1 from public.global_search('NID-T-001') where kind = 'employee' and id = pg_temp.id('e_emp1')));
  perform pg_temp.check('Arabic search folds hamza variants (موظف اول → موظف أول)',
    exists (select 1 from public.global_search('موظف اول') where id = pg_temp.id('e_emp1')));
  perform pg_temp.check('English locale returns English titles',
    (select title from public.global_search('T-001', 'en') where kind = 'employee' limit 1) = 'EN T-001');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Dashboard statistics per role
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  perform pg_temp.as_user('emp1');
  v := public.dashboard_stats();
  perform pg_temp.check('employee dashboard: own section only', v ? 'employee' and not (v ? 'hr') and not (v ? 'manager') and not (v ? 'admin'));
  perform pg_temp.as_user('mgr');
  v := public.dashboard_stats();
  perform pg_temp.check('manager dashboard: team section with 3 direct reports (incl. registered joiner)',
    (v -> 'manager' ->> 'direct_reports')::int = 3 and not (v ? 'hr'));
  perform pg_temp.as_user('hro');
  v := public.dashboard_stats();
  perform pg_temp.check('HR dashboard: organization totals', (v -> 'hr' ->> 'total_employees')::int = 7 and not (v ? 'admin'));
  perform pg_temp.check('HR dashboard: iqama expiring in 20 days lands in the within30 bucket',
    (v -> 'hr' -> 'expiring' -> 'iqama' ->> 'within30')::int = 7 and (v -> 'hr' -> 'expiring' -> 'iqama' ->> 'expired')::int = 0);
  perform pg_temp.check('HR dashboard: insurance expiring in 45 days lands in within60',
    (v -> 'hr' -> 'expiring' -> 'insurance' ->> 'within60')::int = 6);
  perform pg_temp.as_user('sa');
  v := public.dashboard_stats();
  perform pg_temp.check('super admin dashboard includes administration section', v ? 'admin' and v ? 'hr');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Notification e-mail claim + log
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_res jsonb;
  v_ids uuid[];
  v_n   int;
begin
  perform pg_temp.as_user('emp1');
  v_res := public.submit_request(public.create_request_draft(pg_temp.request_type('attendance'),
             '{"attendance_date": "2026-10-01", "reason": "Badge"}', 'missing_check_in'));
  v_ids := array(select jsonb_array_elements_text(v_res -> 'notification_ids')::uuid);
  perform pg_temp.as_user('emp2');
  perform pg_temp.check('other users cannot claim someone else''s notification e-mails',
    (select count(*) from public.claim_notification_emails(v_ids)) = 0);
  perform pg_temp.as_user('emp1');
  select count(*) into v_n from public.claim_notification_emails(v_ids);
  perform pg_temp.check('the actor claims the e-mails for notifications they caused (submitted + approval required)', v_n = 2);
  perform pg_temp.check('claiming is idempotent', (select count(*) from public.claim_notification_emails(v_ids)) = 0);
  perform pg_temp.check('email log can be written by the sender', public.log_email('a@b.c', 'skipped', 'Subject', 'request_submitted', 'hr_request', null) is not null);
  perform pg_temp.as_postgres();
  perform pg_temp.check('claimed rows carry template keys and recipient data',
    (select count(*) from public.notifications where id = any (v_ids) and emailed_at is not null) = 2);
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Expiry alerts (service role) and certificate template versioning
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_n int;
  v_ver int;
begin
  update public.employees set iqama_expiry_date = private.org_today() + 30 where id = pg_temp.id('e_emp1');
  perform pg_temp.as_service();
  v_n := public.generate_expiry_alerts();
  perform pg_temp.check('expiry alert at the 30-day threshold reaches HR (employees.view) and the employee',
    v_n = 4 and exists (select 1 from public.notifications where type = 'expiry_alert' and user_id = pg_temp.id('emp1')
                        and params ->> 'kind' = 'iqama' and (params ->> 'days_left')::int = 30));
  perform pg_temp.check('expiry alerts are idempotent per day', public.generate_expiry_alerts() = 0);
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('employees cannot trigger expiry alerts', 'select public.generate_expiry_alerts()', 'hr:errors.forbidden');

  perform pg_temp.as_user('hra');
  update public.certificate_templates set content_en = content_en || '<p>Edited</p>' where key = 'employment';
  v_ver := public.publish_certificate_template((select id from public.certificate_templates where key = 'employment'), 'Wording update');
  perform pg_temp.check('publishing creates version 2', v_ver = 2);
  perform public.restore_certificate_template_version((select id from public.certificate_templates where key = 'employment'), 1);
  perform pg_temp.check('restoring version 1 publishes it as version 3 with the original wording',
    (select current_version = 3 and content_en not like '%<p>Edited</p>%' from public.certificate_templates where key = 'employment'));
  perform pg_temp.as_user('hro');
  perform pg_temp.throws('HR officer cannot publish templates',
    format('select public.publish_certificate_template(%L)', (select id from public.certificate_templates where key = 'employment')), 'hr:errors.forbidden');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Organization reset
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_audit bigint;
begin
  perform pg_temp.as_user('hra');
  perform pg_temp.throws('only super admins can reset', 'select public.reset_organization(''RESET ORGANIZATION'')', 'hr:errors.forbidden');
  perform pg_temp.as_user('sa');
  perform pg_temp.throws('the confirmation phrase must match exactly', 'select public.reset_organization(''reset organization'')',
    'hr:errors.confirmationMismatch');
  perform pg_temp.as_postgres();
  insert into public.departments (code, name_ar) values ('OPS', 'العمليات');
  update public.organizations set name_en = 'Acme';
  delete from public.leave_types where code = 'other';
  v_audit := (select count(*) from public.audit_logs);

  perform pg_temp.as_user('sa');
  perform public.reset_organization('RESET ORGANIZATION');
  perform pg_temp.as_postgres();
  perform pg_temp.check('business data removed',
    (select count(*) from public.employees) = 0 and (select count(*) from public.hr_requests) = 0
    and (select count(*) from public.certificates) = 0 and (select count(*) from public.departments) = 0
    and (select count(*) from public.notifications) = 0 and (select count(*) from public.leave_balances) = 0);
  perform pg_temp.check('non-super-admin accounts removed; super admin kept with role',
    (select count(*) from public.profiles) = 1 and exists (select 1 from public.profiles where id = pg_temp.id('sa') and status = 'active')
    and not exists (select 1 from auth.users where id = pg_temp.id('emp1'))
    and exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = pg_temp.id('sa') and r.key = 'super_admin'));
  perform pg_temp.check('default configuration restored',
    (select count(*) from public.leave_types) = 11 and (select count(*) from public.request_types) = 12
    and (select count(*) from public.request_fields) = 90 and (select count(*) from public.certificate_templates) = 7
    and (select count(*) from public.email_templates) = 16 and (select count(*) from public.notification_settings) = 18
    and (select name_en from public.organizations) is null and (select setup_completed_at from public.organization_settings) is null);
  perform pg_temp.check('roles, permissions and audit history kept; reset audited',
    (select count(*) from public.roles) = 5 and (select count(*) from public.role_permissions) = 194
    and (select count(*) from public.audit_logs) = v_audit + 1
    and exists (select 1 from public.audit_logs where action = 'organization.reset' and actor_id = pg_temp.id('sa')));
end;
$$;

select pg_temp.finish('06_registration_public_admin');
rollback;
