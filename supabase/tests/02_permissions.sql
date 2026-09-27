-- Permission matrix (role_permissions driven), audit log immutability, privilege-escalation attempts
\set ON_ERROR_STOP 1
begin;
\ir _helpers.sql

select pg_temp.standard_fixtures();

-- ---------------------------------------------------------------------------------------------------
-- HR officer vs HR admin (default matrix)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
  v_bank bigint := (select count(*) from public.employee_bank_accounts);
begin
  perform pg_temp.as_user('hro');
  perform pg_temp.check('hr_officer reads all bank accounts (bank.view)',
    pg_temp.cnt('select 1 from public.employee_bank_accounts') = v_bank);
  perform pg_temp.check('hr_officer cannot update bank accounts (no bank.edit)',
    pg_temp.affected(format('update public.employee_bank_accounts set bank_name = ''X'' where employee_id = %L', e1)) = 0);
  perform pg_temp.throws('hr_officer cannot insert bank accounts (no bank.create)',
    format('insert into public.employee_bank_accounts (employee_id, bank_name, is_primary) values (%L, ''B'', false)', e1),
    'row-level security');
  perform pg_temp.check('hr_officer cannot read audit logs (no audit.view)', pg_temp.cnt('select 1 from public.audit_logs') = 0);
  perform pg_temp.check('hr_officer cannot change organization settings (no settings.edit)',
    pg_temp.affected('update public.organization_settings set portal_name_en = ''Hacked''') = 0);
  perform pg_temp.throws('hr_officer cannot change the permission matrix',
    format('insert into public.role_permissions (role_id, module, action) values (%L, ''audit'', ''view'')',
           (select id from public.roles where key = 'hr_officer')), 'row-level security');
  perform pg_temp.throws('hr_officer cannot approve registrations',
    format('select public.approve_registration(%L, null)', pg_temp.id('pend')), 'hr:errors.forbidden');
  perform pg_temp.check('hr_officer can update insurance (insurance.edit)',
    pg_temp.affected(format('update public.employee_insurance set provider = ''New insurer'' where employee_id = %L', e1)) = 1);
  perform pg_temp.check('hr_officer can edit personal data (personal_data.edit)',
    pg_temp.affected(format('update public.employees set passport_number = ''P-NEW'' where id = %L', e1)) = 1);

  perform pg_temp.as_user('hra');
  perform pg_temp.check('hr_admin can update bank accounts',
    pg_temp.affected(format('update public.employee_bank_accounts set bank_name = ''Updated Bank'' where employee_id = %L', e1)) = 1);
  perform pg_temp.check('hr_admin can update compensation',
    pg_temp.affected(format('update public.employee_compensation set basic_salary = 12000 where employee_id = %L', e1)) = 1);
  perform pg_temp.check('hr_admin reads audit logs', pg_temp.cnt('select 1 from public.audit_logs') > 0);
  perform pg_temp.check('hr_admin can change organization settings',
    pg_temp.affected('update public.organization_settings set portal_name_en = ''People Portal''') = 1);
  perform pg_temp.check('hr_admin can extend a non-super role''s permissions',
    pg_temp.affected(format('insert into public.role_permissions (role_id, module, action) values (%L, ''reports'', ''view'')',
                            (select id from public.roles where key = 'manager'))) = 1);
  perform pg_temp.throws('hr_admin cannot touch the super_admin role''s permissions',
    format('delete from public.role_permissions where role_id = %L', (select id from public.roles where key = 'super_admin')),
    'hr:errors.forbidden');
  perform pg_temp.throws('hr_admin cannot create an organization-scoped role',
    'insert into public.roles (key, name_ar, name_en, data_scope) values (''shadow_hr'', ''س'', ''S'', ''organization'')',
    'hr:errors.forbidden');
  perform pg_temp.check('hr_admin can create a custom own-scope role',
    pg_temp.affected('insert into public.roles (key, name_ar, name_en) values (''trainee'', ''متدرب'', ''Trainee'')') = 1);
  perform pg_temp.throws('hr_admin cannot widen a system role''s data scope',
    'update public.roles set data_scope = ''organization'' where key = ''employee''', 'hr:errors.forbidden');
  perform pg_temp.throws('system roles cannot be deleted',
    'delete from public.roles where key = ''manager''', 'hr:errors.systemRecord');
  perform pg_temp.as_postgres();
end;
$$;

-- permissions are data: removing / granting rows changes access immediately
do $$
declare
  e1 uuid := pg_temp.id('e_emp1');
begin
  delete from public.role_permissions
  where role_id = (select id from public.roles where key = 'hr_officer') and module = 'bank' and action = 'view';
  delete from public.role_permissions
  where role_id = (select id from public.roles where key = 'hr_officer') and module = 'personal_data' and action = 'edit';
  insert into public.role_permissions (role_id, module, action)
  select id, 'insurance', 'administer' from public.roles where key = 'hr_officer';
  insert into public.role_permissions (role_id, module, action)
  select id, 'bank', 'edit' from public.roles where key = 'hr_officer';

  perform pg_temp.as_user('hro');
  perform pg_temp.check('revoking bank.view from hr_officer hides other employees'' bank rows (own row stays)',
    pg_temp.cnt('select 1 from public.employee_bank_accounts') = 1
    and pg_temp.cnt(format('select 1 from public.employee_bank_accounts where employee_id = %L', pg_temp.id('e_hro'))) = 1);
  perform pg_temp.throws('revoking personal_data.edit blocks identity-document edits',
    format('update public.employees set national_id = ''999'' where id = %L', e1), 'hr:errors.forbidden');
  perform pg_temp.check('non-personal employee fields stay editable with employees.edit',
    pg_temp.affected(format('update public.employees set grade = ''G5'' where id = %L', e1)) = 1);
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- audit_logs: append-only for everyone
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_before bigint;
  v_row    public.audit_logs;
begin
  perform pg_temp.check('bank account change was audited with the IBAN masked',
    exists (select 1 from public.audit_logs where action = 'employee_bank_account.update'
            and changes ? 'bank_name' and not (changes ? 'iban'))
    and exists (select 1 from public.audit_logs where action = 'employee_bank_account.create'
                and changes -> 'iban' ->> 'new' = '***'));
  perform pg_temp.check('salary change was audited with values masked but field named',
    exists (select 1 from public.audit_logs where action = 'employee_compensation.update'
            and changes -> 'basic_salary' ->> 'old' = '***' and changes -> 'basic_salary' ->> 'new' = '***'
            and changes -> 'total_salary' ->> 'new' = '***'));
  perform pg_temp.check('national_id / passport_number masked in employee audit rows',
    not exists (select 1 from public.audit_logs where action like 'employee.%'
                and (changes -> 'national_id' ->> 'new' not in ('***') or changes -> 'passport_number' ->> 'new' not in ('***'))));

  perform pg_temp.as_user('sa');
  perform pg_temp.throws('super_admin cannot update audit_logs', 'update public.audit_logs set summary = ''x''', 'permission denied');
  perform pg_temp.throws('super_admin cannot delete audit_logs', 'delete from public.audit_logs', 'permission denied');
  perform pg_temp.as_service();
  perform pg_temp.throws('service_role cannot update audit_logs', 'update public.audit_logs set summary = ''x''', 'permission denied');
  perform pg_temp.throws('service_role cannot delete audit_logs', 'delete from public.audit_logs', 'permission denied');
  perform pg_temp.as_postgres();
  perform pg_temp.throws('table owner cannot delete audit_logs', 'delete from public.audit_logs', '');
  perform pg_temp.throws('table owner cannot truncate audit_logs', 'truncate public.audit_logs', '');
  perform pg_temp.throws('even with privileges re-granted, the guard trigger blocks updates',
    'grant update on public.audit_logs to postgres; update public.audit_logs set summary = ''x''', 'hr:errors.forbidden');

  v_before := (select count(*) from public.audit_logs);
  perform pg_temp.as_user('emp1');
  perform public.log_audit_event('export.employees', 'employee', null, 'Exported employees', '{"iban": "SA123", "rows": 3}');
  perform pg_temp.as_postgres();
  select * into v_row from public.audit_logs order by id desc limit 1;
  perform pg_temp.check('log_audit_event appends one row attributed to the caller',
    (select count(*) from public.audit_logs) = v_before + 1 and v_row.actor_id = pg_temp.id('emp1')
    and v_row.action = 'export.employees');
  perform pg_temp.check('log_audit_event masks sensitive keys', v_row.changes ->> 'iban' = '***' and v_row.changes ->> 'rows' = '3');
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('log_audit_event rejects malformed actions', 'select public.log_audit_event(''bad action'', null, null, null)',
    'hr:errors.validation');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Privilege escalation attempts
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.as_user('emp1');
  perform pg_temp.throws('employee cannot activate / change own profile status',
    format('update public.profiles set status = ''active'' where id = %L', pg_temp.id('emp1')), 'permission denied');
  perform pg_temp.throws('employee cannot relink own profile to another employee',
    format('update public.profiles set employee_id = %L where id = %L', pg_temp.id('e_emp3'), pg_temp.id('emp1')), 'permission denied');
  perform pg_temp.check('employee can update own display preferences / name / mobile',
    pg_temp.affected(format('update public.profiles set preferred_language = ''en'', theme = ''dark'', full_name = ''Me'', mobile = ''0500000000'' where id = %L',
                            pg_temp.id('emp1'))) = 1);
  perform pg_temp.check('employee cannot update someone else''s profile',
    pg_temp.affected(format('update public.profiles set full_name = ''X'' where id = %L', pg_temp.id('emp2'))) = 0);
  perform pg_temp.throws('employee cannot edit registration fields once active',
    format('update public.profiles set registration_note = ''x'' where id = %L', pg_temp.id('emp1')), 'hr:errors.forbidden');
  perform pg_temp.throws('employee cannot insert user_roles',
    format('insert into public.user_roles (user_id, role_id) select %L, id from public.roles where key = ''super_admin''', pg_temp.id('emp1')),
    'permission denied');
  perform pg_temp.throws('employee cannot call set_user_roles',
    format('select public.set_user_roles(%L, array[''hr_admin''])', pg_temp.id('emp1')), 'hr:errors.forbidden');
  perform pg_temp.check('employee cannot update own employee record',
    pg_temp.affected(format('update public.employees set grade = ''X'' where id = %L', pg_temp.id('e_emp1'))) = 0);
  perform pg_temp.throws('employee cannot file a document for another employee',
    format('insert into public.employee_documents (employee_id, document_type, status) values (%L, ''other'', ''pending_review'')',
           pg_temp.id('e_emp2')), 'row-level security');
  perform pg_temp.throws('employee uploads cannot bypass review',
    format('insert into public.employee_documents (employee_id, document_type, status) values (%L, ''other'', ''valid'')',
           pg_temp.id('e_emp1')), 'row-level security');
  perform pg_temp.check('employee can file own document as pending_review',
    pg_temp.affected(format('insert into public.employee_documents (employee_id, document_type, status) values (%L, ''other'', ''pending_review'')',
                            pg_temp.id('e_emp1'))) = 1);
  perform pg_temp.throws('document rows must point into their own storage folder (no path hijacking)',
    format('insert into public.employee_documents (employee_id, document_type, status, storage_path) values (%L, ''other'', ''pending_review'', %L)',
           pg_temp.id('e_emp1'), pg_temp.id('e_emp2') || '/' || gen_random_uuid() || '/x.pdf'), 'employee_documents_storage_path_check');
  perform pg_temp.set_id('d_other', public.create_request_draft(pg_temp.request_type('other'), '{"subject": "x"}'));
  perform pg_temp.throws('request attachments must point into their request folder',
    format('insert into public.request_attachments (request_id, storage_path, file_name) values (%L, %L, ''x.pdf'')',
           pg_temp.id('d_other'), 'requests/' || gen_random_uuid() || '/x.pdf'), 'request_attachments_storage_path_check');
  perform pg_temp.throws('employee cannot issue certificates',
    format('insert into public.certificates (certificate_number, employee_id, certificate_type, language) values (''CERT-X'', %L, ''salary'', ''ar'')',
           pg_temp.id('e_emp1')), 'row-level security');
  perform pg_temp.throws('employee cannot read document sequences', 'select 1 from public.document_sequences', 'permission denied');

  perform pg_temp.as_user('hra');
  perform pg_temp.throws('hr_admin cannot grant super_admin (even to self)',
    format('select public.set_user_roles(%L, array[''hr_admin'', ''super_admin''])', pg_temp.id('hra')), 'hr:errors.forbidden');
  perform pg_temp.throws('hr_admin cannot change a super admin''s roles',
    format('select public.set_user_roles(%L, array[''employee''])', pg_temp.id('sa')), 'hr:errors.forbidden');
  perform pg_temp.throws('hr_admin cannot disable a super admin',
    format('select public.set_user_status(%L, ''disabled'')', pg_temp.id('sa')), 'hr:errors.forbidden');
  perform public.set_user_roles(pg_temp.id('emp1'), array['employee', 'manager']);
  perform pg_temp.check('hr_admin can assign ordinary roles (audited)',
    (select array_agg(r.key order by r.key) from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = pg_temp.id('emp1')) = array['employee', 'manager']);
  perform pg_temp.as_postgres();
  perform pg_temp.check('role change audited as user.roles_update',
    exists (select 1 from public.audit_logs where action = 'user.roles_update' and entity_id = pg_temp.id('emp1')::text));

  -- make the fixture 'sa' the only active super admin inside this transaction (other data may exist)
  update public.profiles set status = 'disabled'
  where id <> pg_temp.id('sa') and status = 'active'
    and id in (select ur.user_id from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'super_admin');
  perform pg_temp.as_user('sa');
  perform pg_temp.throws('last super admin cannot drop the super_admin role',
    format('select public.set_user_roles(%L, array[''employee''])', pg_temp.id('sa')), 'hr:errors.lastSuperAdmin');
  perform pg_temp.throws('super admin cannot disable themselves',
    format('select public.set_user_status(%L, ''disabled'')', pg_temp.id('sa')), 'hr:errors.forbidden');
  perform pg_temp.as_postgres();

  perform pg_temp.new_user('sa2', 'active', array['super_admin']);
  perform pg_temp.as_user('sa');
  perform public.set_user_status(pg_temp.id('sa2'), 'disabled');
  perform pg_temp.check('super admin can disable another super admin while one stays active',
    (select status from public.profiles where id = pg_temp.id('sa2')) = 'disabled');
  perform pg_temp.throws('after that the remaining super admin is protected',
    format('select public.set_user_roles(%L, array[''employee''])', pg_temp.id('sa')), 'hr:errors.lastSuperAdmin');

  perform pg_temp.as_service();
  perform pg_temp.throws('service_role cannot remove the last super admin role row either',
    format('delete from public.user_roles where user_id = %L', pg_temp.id('sa')), 'hr:errors.lastSuperAdmin');
  perform pg_temp.throws('service_role cannot disable the last super admin either',
    format('update public.profiles set status = ''disabled'' where id = %L', pg_temp.id('sa')), 'hr:errors.lastSuperAdmin');
  perform pg_temp.as_postgres();
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Function privileges: mutating internals are unreachable for signed-in users
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  perform pg_temp.check('authenticated cannot execute workflow/notification/audit/seed internals',
    not exists (select 1 from pg_proc p where p.pronamespace = 'private'::regnamespace
                and p.proname in ('enter_steps', 'finalize_approval', 'notify', 'notify_many', 'write_audit', 'seed_defaults',
                                  'seed_roles_permissions', 'leave_consume', 'leave_release', 'apply_bank_update',
                                  'save_request_values', 'next_document_number', 'ensure_leave_balance')
                and has_function_privilege('authenticated', p.oid, 'execute')));
  perform pg_temp.check('private schema is not exposed to anon', not has_schema_privilege('anon', 'private', 'usage'));
  perform pg_temp.check('every public table has RLS enabled',
    not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity));
  perform pg_temp.check('every security-definer function pins search_path',
    not exists (select 1 from pg_proc p where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
                and p.prosecdef and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')));
end;
$$;

select pg_temp.finish('02_permissions');
rollback;
