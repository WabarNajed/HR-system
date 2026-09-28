-- RLS isolation: employee / manager / HR / pending / disabled / anon
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

-- activity: emp1 files a leave request (manager → HR) and a bank update (HR only); emp3 files leave
do $$
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.set_id('r_emp1_leave', public.create_request_draft(pg_temp.request_type('leave'),
    jsonb_build_object('leave_type', pg_temp.leave_type('annual'), 'start_date', '2026-11-01', 'end_date', '2026-11-02',
                       'reason', 'family matter'), null));
  perform public.submit_request(pg_temp.id('r_emp1_leave'));
  perform public.add_request_comment(pg_temp.id('r_emp1_leave'), 'Visible note from employee', false);

  perform pg_temp.set_id('r_emp1_bank', public.create_request_draft(pg_temp.request_type('bank_update'),
    jsonb_build_object('bank_name', 'New Bank', 'iban', 'SA44 2000 0001 2345 6789 1234', 'account_holder', 'EN T-001'), null));
  insert into public.request_attachments (request_id, field_key, storage_path, file_name)
  values (pg_temp.id('r_emp1_bank'), 'iban_certificate',
          'requests/' || pg_temp.id('r_emp1_bank') || '/' || gen_random_uuid() || '-iban.pdf', 'iban.pdf');
  perform public.submit_request(pg_temp.id('r_emp1_bank'));

  perform pg_temp.as_user('emp3');
  perform pg_temp.set_id('r_emp3_leave', public.create_request_draft(pg_temp.request_type('leave'),
    jsonb_build_object('leave_type', pg_temp.leave_type('annual'), 'start_date', '2026-11-08', 'end_date', '2026-11-09'), null));
  perform public.submit_request(pg_temp.id('r_emp3_leave'));

  perform pg_temp.as_user('hro');
  perform public.add_request_comment(pg_temp.id('r_emp1_leave'), 'Internal HR note', true);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Employee isolation
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
  v_types bigint := (select count(*) from public.request_types where is_active);
  v_leave bigint := (select count(*) from public.leave_types where is_active);
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.check('employee sees exactly one employee row (own)',
    pg_temp.cnt('select 1 from public.employees') = 1 and (select id from public.employees) = e1);
  perform pg_temp.check('employee sees own compensation only',
    pg_temp.cnt('select 1 from public.employee_compensation') = 1
    and pg_temp.cnt(format('select 1 from public.employee_compensation where employee_id <> %L', e1)) = 0);
  perform pg_temp.check('employee sees own bank account only',
    pg_temp.cnt('select 1 from public.employee_bank_accounts') = 1
    and pg_temp.cnt(format('select 1 from public.employee_bank_accounts where employee_id <> %L', e1)) = 0);
  perform pg_temp.check('employee sees own insurance only',
    pg_temp.cnt('select 1 from public.employee_insurance') = 1
    and pg_temp.cnt(format('select 1 from public.employee_insurance where employee_id <> %L', e1)) = 0);
  perform pg_temp.check('employee sees own dependents only',
    pg_temp.cnt('select 1 from public.employee_dependents') = 1
    and pg_temp.cnt(format('select 1 from public.employee_dependents where employee_id <> %L', e1)) = 0);
  perform pg_temp.check('employee sees own non-confidential documents only (medical report hidden)',
    pg_temp.cnt('select 1 from public.employee_documents') = 1
    and (select document_type from public.employee_documents) = 'passport');
  perform pg_temp.check('employee sees only own requests',
    pg_temp.cnt('select 1 from public.hr_requests') = 2
    and pg_temp.cnt(format('select 1 from public.hr_requests where employee_id <> %L', e1)) = 0);
  perform pg_temp.check('employee cannot see another employee''s request values',
    pg_temp.cnt(format('select 1 from public.hr_request_values where request_id = %L', pg_temp.id('r_emp3_leave'))) = 0);
  perform pg_temp.check('employee sees only own leave requests and balances',
    pg_temp.cnt(format('select 1 from public.leave_requests where employee_id <> %L', e1)) = 0
    and pg_temp.cnt(format('select 1 from public.leave_balances where employee_id <> %L', e1)) = 0
    and pg_temp.cnt('select 1 from public.leave_balances') >= 1);
  perform pg_temp.check('employee never sees internal comments',
    pg_temp.cnt(format('select 1 from public.request_comments where request_id = %L', pg_temp.id('r_emp1_leave'))) = 1
    and pg_temp.cnt('select 1 from public.request_comments where is_internal') = 0);
  perform pg_temp.check('employee sees only own notifications',
    pg_temp.cnt('select 1 from public.notifications') >= 1
    and pg_temp.cnt(format('select 1 from public.notifications where user_id <> %L', pg_temp.id('emp1'))) = 0);
  perform pg_temp.check('employee cannot read audit logs', pg_temp.cnt('select 1 from public.audit_logs') = 0);
  perform pg_temp.check('employee cannot read e-mail templates / logs',
    pg_temp.cnt('select 1 from public.email_templates') = 0 and pg_temp.cnt('select 1 from public.email_logs') = 0);
  perform pg_temp.check('employee sees own roles only',
    pg_temp.cnt(format('select 1 from public.user_roles where user_id <> %L', pg_temp.id('emp1'))) = 0);
  perform pg_temp.check('employee reads only its own full profile row (no HR / manager e-mail, mobile, notes)',
    pg_temp.cnt('select 1 from public.profiles') = 1 and (select id from public.profiles) = pg_temp.id('emp1'));
  perform pg_temp.check('employee sees manager and HR name cards but not peers',
    pg_temp.cnt(format('select 1 from public.profile_cards where id = %L', pg_temp.id('mgr'))) = 1
    and pg_temp.cnt(format('select 1 from public.profile_cards where id = %L', pg_temp.id('hro'))) = 1
    and pg_temp.cnt(format('select 1 from public.profile_cards where id in (%L, %L)', pg_temp.id('emp2'), pg_temp.id('emp3'))) = 0);
  perform pg_temp.check('profile_cards exposes only id, full_name, employee_id, status',
    (select array_agg(column_name::text order by column_name) from information_schema.columns
      where table_schema = 'public' and table_name = 'profile_cards') = array['employee_id', 'full_name', 'id', 'status']);
  perform pg_temp.throws('profile_cards is read-only',
    format('update public.profile_cards set full_name = ''x'' where id = %L', pg_temp.id('hro')), 'permission denied');
  perform pg_temp.check('employee reads active configuration (request types, leave types, org settings)',
    pg_temp.cnt('select 1 from public.request_types') = v_types and pg_temp.cnt('select 1 from public.leave_types') = v_leave
    and pg_temp.cnt('select 1 from public.organization_settings') = 1);
  perform pg_temp.check('employee sees manager card via get_employee_manager',
    (public.get_employee_manager(e1) ->> 'id')::uuid = pg_temp.id('e_mgr'));
  perform pg_temp.check('get_employee_manager returns nothing for another employee',
    public.get_employee_manager(pg_temp.id('e_emp3')) is null);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Manager visibility
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
begin
  perform pg_temp.as_user('mgr');
  perform pg_temp.check('manager sees self + 2 direct reports (3 employee rows)',
    pg_temp.cnt('select 1 from public.employees') = 3
    and pg_temp.cnt(format('select 1 from public.employees where id = %L', pg_temp.id('e_emp3'))) = 0);
  perform pg_temp.check('manager sees direct reports'' name cards (not full profile rows), not other teams',
    pg_temp.cnt(format('select 1 from public.profile_cards where id in (%L, %L)', pg_temp.id('emp1'), pg_temp.id('emp2'))) = 2
    and pg_temp.cnt(format('select 1 from public.profile_cards where id = %L', pg_temp.id('emp3'))) = 0
    and pg_temp.cnt('select 1 from public.profiles') = 1);
  perform pg_temp.check('manager directory KPIs: both reports counted, both have portal access',
    (public.employee_directory_stats(pg_temp.id('e_mgr')) ->> 'total')::int = 2
    and (public.employee_directory_stats(pg_temp.id('e_mgr')) ->> 'without_portal')::int = 0);
  perform pg_temp.check('manager cannot see reports'' compensation',
    pg_temp.cnt(format('select 1 from public.employee_compensation where employee_id = %L', e1)) = 0);
  perform pg_temp.check('manager cannot see reports'' bank accounts',
    pg_temp.cnt(format('select 1 from public.employee_bank_accounts where employee_id = %L', e1)) = 0);
  perform pg_temp.check('manager cannot see reports'' insurance / dependents',
    pg_temp.cnt(format('select 1 from public.employee_insurance where employee_id = %L', e1)) = 0
    and pg_temp.cnt(format('select 1 from public.employee_dependents where employee_id = %L', e1)) = 0);
  perform pg_temp.check('manager cannot see reports'' documents (confidential or not)',
    pg_temp.cnt(format('select 1 from public.employee_documents where employee_id = %L', e1)) = 0);
  perform pg_temp.check('manager sees report''s leave request (team, manager step)',
    pg_temp.cnt(format('select 1 from public.hr_requests where id = %L', pg_temp.id('r_emp1_leave'))) = 1
    and pg_temp.cnt(format('select 1 from public.leave_requests where employee_id = %L', e1)) = 1
    and pg_temp.cnt(format('select 1 from public.leave_balances where employee_id = %L', e1)) >= 1);
  perform pg_temp.check('manager does NOT see report''s HR-only bank update request or its values',
    pg_temp.cnt(format('select 1 from public.hr_requests where id = %L', pg_temp.id('r_emp1_bank'))) = 0
    and pg_temp.cnt(format('select 1 from public.hr_request_values where request_id = %L', pg_temp.id('r_emp1_bank'))) = 0);
  perform pg_temp.check('manager does not see a non-report''s request or leave',
    pg_temp.cnt(format('select 1 from public.hr_requests where id = %L', pg_temp.id('r_emp3_leave'))) = 0
    and pg_temp.cnt(format('select 1 from public.leave_requests where employee_id = %L', pg_temp.id('e_emp3'))) = 0);
  perform pg_temp.check('manager sees employee-visible comments but not internal HR comments',
    pg_temp.cnt(format('select 1 from public.request_comments where request_id = %L', pg_temp.id('r_emp1_leave'))) = 1
    and pg_temp.cnt('select 1 from public.request_comments where is_internal') = 0);
  perform pg_temp.check('manager is the current approver of the report''s leave',
    (select current_approver_id from public.hr_requests where id = pg_temp.id('r_emp1_leave')) = pg_temp.id('mgr'));
  perform pg_temp.check('manager cannot read audit logs', pg_temp.cnt('select 1 from public.audit_logs') = 0);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- HR visibility
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_employees bigint := (select count(*) from public.employees);
  v_requests  bigint := (select count(*) from public.hr_requests where status <> 'draft');
  v_internal  bigint := (select count(*) from public.request_comments where is_internal);
begin
  perform pg_temp.as_user('hro');
  perform pg_temp.check('HR officer sees all employees', pg_temp.cnt('select 1 from public.employees') = v_employees);
  perform pg_temp.check('HR reads full profile rows of peers (portal accounts)',
    pg_temp.cnt(format('select 1 from public.profiles where id in (%L, %L, %L)', pg_temp.id('emp1'), pg_temp.id('emp3'), pg_temp.id('pend'))) = 3);
  perform pg_temp.check('HR officer sees internal comments',
    pg_temp.cnt('select 1 from public.request_comments where is_internal') = v_internal and v_internal >= 1);
  perform pg_temp.check('HR officer sees all submitted requests',
    pg_temp.cnt('select 1 from public.hr_requests where status <> ''draft''') = v_requests);
  perform pg_temp.check('HR officer sees confidential documents (documents.view)',
    pg_temp.cnt('select 1 from public.employee_documents where is_confidential') >= 1);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Pending / disabled users: nothing but their own profile
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  k text;
begin
  foreach k in array array['pend', 'dis'] loop
    perform pg_temp.as_user(k);
    perform pg_temp.check(k || ': sees only own profile',
      pg_temp.cnt('select 1 from public.profiles') = 1 and (select id from public.profiles) = pg_temp.id(k)
      and pg_temp.cnt('select 1 from public.profile_cards') = 1);
    perform pg_temp.check(k || ': sees no business data',
      pg_temp.cnt('select 1 from public.employees') = 0 and pg_temp.cnt('select 1 from public.hr_requests') = 0
      and pg_temp.cnt('select 1 from public.leave_balances') = 0 and pg_temp.cnt('select 1 from public.notifications') = 0
      and pg_temp.cnt('select 1 from public.employee_documents') = 0);
    perform pg_temp.check(k || ': sees no configuration or roles',
      pg_temp.cnt('select 1 from public.roles') = 0 and pg_temp.cnt('select 1 from public.user_roles') = 0
      and pg_temp.cnt('select 1 from public.request_types') = 0 and pg_temp.cnt('select 1 from public.leave_types') = 0
      and pg_temp.cnt('select 1 from public.organization_settings') = 0 and pg_temp.cnt('select 1 from public.departments') = 0);
    perform pg_temp.check(k || ': dashboard_stats has no data', public.dashboard_stats() ->> 'scope' = 'none');
    perform pg_temp.throws(k || ': cannot create requests',
      format('select public.create_request_draft(%L, ''{}'', null)', pg_temp.request_type('other')), 'hr:errors.forbidden');
    perform pg_temp.check(k || ': global search returns nothing', pg_temp.cnt('select 1 from public.global_search(''T-00'')') = 0);
  end loop;
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- anon: only verify_certificate + get_public_branding
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.check('anon can execute exactly verify_certificate and get_public_branding',
    (select array_agg(p.proname::text order by p.proname) from pg_proc p
       where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute'))
    = array['get_public_branding', 'verify_certificate']);
  perform pg_temp.check('anon has no table privileges in public',
    not exists (select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'));

  perform pg_temp.as_anon();
  perform pg_temp.throws('anon cannot select employees', 'select 1 from public.employees', 'permission denied');
  perform pg_temp.throws('anon cannot select profiles', 'select 1 from public.profiles', 'permission denied');
  perform pg_temp.throws('anon cannot select profile cards', 'select 1 from public.profile_cards', 'permission denied');
  perform pg_temp.throws('anon cannot call dashboard_stats', 'select public.dashboard_stats()', 'permission denied');
  perform pg_temp.throws('anon cannot call global_search', 'select * from public.global_search(''x'')', 'permission denied');
  perform pg_temp.throws('anon cannot call next_document_number', 'select public.next_document_number(''CERT'')', 'permission denied');
  perform pg_temp.check('anon get_public_branding returns portal names',
    public.get_public_branding() ->> 'portal_name_ar' = 'بوابة الموارد البشرية'
    and public.get_public_branding() ->> 'portal_name_en' = 'HR Portal');
  perform pg_temp.check('anon verify_certificate on unknown number returns no row',
    pg_temp.cnt('select 1 from public.verify_certificate(''CERT-2000-000001'')') = 0);
  perform pg_temp.check('anon sees no private storage objects',
    pg_temp.cnt('select 1 from storage.objects where bucket_id <> ''branding''') = 0);
  perform pg_temp.as_postgres();
end;
$$;

select pg_temp.finish('01_rls_isolation');
rollback;
