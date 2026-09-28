-- =====================================================================================================
-- Test helpers (included by every test file with \ir _helpers.sql, inside the file's transaction).
-- Everything lives in pg_temp and disappears with the session; the test transaction is rolled back.
--   pg_temp.as_user('key')   → set local role authenticated + request.jwt.claims {sub, role}
--   pg_temp.as_anon() / pg_temp.as_service() / pg_temp.as_postgres()
--   pg_temp.check(name, condition)            → NOTICE 'PASS name' / 'FAIL name'
--   pg_temp.throws(name, sql, 'fragment')     → PASS when sql raises an error whose message contains fragment
--   pg_temp.cnt(sql) → bigint                 → row count of a query as the current role
--   pg_temp.new_employee(...) / pg_temp.new_user(...) fixtures (run as postgres)
--   pg_temp.id('key') → uuid of a fixture
--   pg_temp.finish('file') → summary; raises (non-zero exit) when any check failed
-- =====================================================================================================
set client_min_messages = notice;
select set_config('test.pass', '0', false), set_config('test.fail', '0', false);

create or replace function pg_temp.set_id(p_key text, p_id uuid) returns void language sql as $$
  select set_config('fx.' || p_key, p_id::text, false);
$$;

create or replace function pg_temp.id(p_key text) returns uuid language sql stable as $$
  select nullif(current_setting('fx.' || p_key, true), '')::uuid;
$$;

create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform set_config('role', 'service_role', true);
end;
$$;

create or replace function pg_temp.check(p_name text, p_ok boolean, p_info text default null) returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then
    perform set_config('test.pass', (current_setting('test.pass')::int + 1)::text, false);
    raise notice 'PASS %', p_name;
  else
    perform set_config('test.fail', (current_setting('test.fail')::int + 1)::text, false);
    raise notice 'FAIL %', p_name || coalesce('  (' || p_info || ')', '');
  end if;
end;
$$;

create or replace function pg_temp.throws(p_name text, p_sql text, p_fragment text default null) returns void language plpgsql as $$
declare
  v_ok boolean;
begin
  begin
    execute p_sql;
    v_ok := null;
  exception when others then
    v_ok := p_fragment is null or sqlerrm like '%' || p_fragment || '%';
    if not v_ok then
      perform pg_temp.check(p_name, false, 'unexpected error: ' || sqlerrm);
      return;
    end if;
  end;
  if v_ok is null then
    perform pg_temp.check(p_name, false, 'no error raised');
  else
    perform pg_temp.check(p_name, true);
  end if;
end;
$$;

create or replace function pg_temp.cnt(p_sql text) returns bigint language plpgsql as $$
declare
  v bigint;
begin
  execute 'select count(*) from (' || p_sql || ') as q' into v;
  return v;
end;
$$;

create or replace function pg_temp.affected(p_sql text) returns bigint language plpgsql as $$
declare
  v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Fixtures (call as postgres) ----------------------------------------------------------------------
create or replace function pg_temp.new_employee(
  p_key text, p_number text, p_name_ar text, p_manager_key text default null, p_gender text default 'male'
) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.employees (employee_number, name_ar, name_en, gender, manager_id, joining_date, employment_status,
                                national_id, id_type, iqama_expiry_date, passport_number)
  values (p_number, p_name_ar, 'EN ' || p_number, p_gender, pg_temp.id(p_manager_key), date '2020-01-01', 'active',
          'NID-' || p_number, 'iqama', current_date + 20, 'P-' || p_number)
  returning id into v_id;
  perform pg_temp.set_id(p_key, v_id);
  return v_id;
end;
$$;

create or replace function pg_temp.new_user(
  p_key text, p_status text, p_roles text[], p_employee_key text default null
) returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at,
                          created_at, updated_at)
  values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_key || '.' || left(v_id::text, 8) || '@test.local', '{"provider": "email"}', '{}', now(), now(), now());
  update public.profiles
  set status = p_status, employee_id = pg_temp.id(p_employee_key), full_name = 'User ' || p_key
  where id = v_id;
  insert into public.user_roles (user_id, role_id)
  select v_id, r.id from public.roles r where r.key = any (p_roles);
  perform pg_temp.set_id(p_key, v_id);
  return v_id;
end;
$$;

-- Standard organization used by most files:
--   mgr (manager, employee roles) manages emp1 and emp2; emp3 reports to nobody (other team)
--   hro (hr_officer), hra (hr_admin), sa (super_admin); pend (pending), dis (disabled)
create or replace function pg_temp.standard_fixtures() returns void language plpgsql as $$
begin
  perform pg_temp.new_employee('e_mgr', 'T-MGR', 'مدير الاختبار', null, 'male');
  perform pg_temp.new_employee('e_emp1', 'T-001', 'موظف أول', 'e_mgr', 'male');
  perform pg_temp.new_employee('e_emp2', 'T-002', 'موظفة ثانية', 'e_mgr', 'female');
  perform pg_temp.new_employee('e_emp3', 'T-003', 'موظف ثالث', null, 'male');
  perform pg_temp.new_employee('e_hro', 'T-HRO', 'أخصائي موارد', null, 'female');
  perform pg_temp.new_employee('e_hra', 'T-HRA', 'مدير موارد', null, 'male');

  perform pg_temp.new_user('sa', 'active', array['super_admin']);
  perform pg_temp.new_user('hra', 'active', array['hr_admin', 'employee'], 'e_hra');
  perform pg_temp.new_user('hro', 'active', array['hr_officer', 'employee'], 'e_hro');
  perform pg_temp.new_user('mgr', 'active', array['manager', 'employee'], 'e_mgr');
  perform pg_temp.new_user('emp1', 'active', array['employee'], 'e_emp1');
  perform pg_temp.new_user('emp2', 'active', array['employee'], 'e_emp2');
  perform pg_temp.new_user('emp3', 'active', array['employee'], 'e_emp3');
  perform pg_temp.new_user('pend', 'pending', array[]::text[]);
  perform pg_temp.new_user('dis', 'disabled', array['employee']);

  -- sensitive sub-records for every employee
  insert into public.employee_compensation (employee_id, basic_salary, housing_allowance, transport_allowance)
  select id, 10000, 2500, 1000 from public.employees where employee_number like 'T-%';
  insert into public.employee_bank_accounts (employee_id, bank_name, iban, account_holder)
  select id, 'Test Bank', 'SA0380000000608010167519', name_en from public.employees where employee_number like 'T-%';
  insert into public.employee_dependents (employee_id, name_ar, relationship)
  select id, 'تابع', 'son' from public.employees where employee_number like 'T-%';
  insert into public.employee_insurance (employee_id, provider, policy_number, expiry_date)
  select id, 'Insurer', 'POL-1', current_date + 45 from public.employees where employee_number like 'T-%';
  -- one fresh id per row (an uncorrelated LATERAL gen_random_uuid() can be evaluated once → duplicate key)
  insert into public.employee_documents (id, employee_id, document_type, document_number, status, is_confidential, storage_path)
  select d.doc_id, d.id, 'passport', 'P-' || d.employee_number, 'valid', false, d.id::text || '/' || d.doc_id::text || '/passport.pdf'
  from (select e.id, e.employee_number, gen_random_uuid() as doc_id
        from public.employees e where e.employee_number like 'T-%') d;
  insert into public.employee_documents (employee_id, document_type, status)
  select id, 'medical_report', 'valid' from public.employees where employee_number like 'T-%';
end;
$$;

create or replace function pg_temp.request_type(p_key text) returns uuid language sql stable as $$
  select id from public.request_types where key = p_key;
$$;

create or replace function pg_temp.leave_type(p_code text) returns uuid language sql stable as $$
  select id from public.leave_types where code = p_code;
$$;

create or replace function pg_temp.finish(p_file text) returns void language plpgsql as $$
begin
  raise notice 'SUMMARY % pass=% fail=%', p_file, current_setting('test.pass'), current_setting('test.fail');
  if current_setting('test.fail')::int > 0 then
    raise exception 'test file % has % failing check(s)', p_file, current_setting('test.fail');
  end if;
end;
$$;
