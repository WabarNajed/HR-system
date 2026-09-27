-- M3 · Employees module: identity-column guard on INSERT + compensation clearing in save_employee
--
-- 1. private.employees_insert_guard(): the RLS matrix (ARCHITECTURE §7) says identity / personal
--    columns need `personal_data.edit`. private.employees_guard() enforces that on UPDATE only, so a
--    role holding `employees.create` without `personal_data.edit` could still write national IDs,
--    passports, DOB, address, emergency contacts … by inserting a new row directly through PostgREST.
--    This BEFORE INSERT trigger closes that gap (same column list, same error, same bypass for
--    definer/service code whose current_user is not `authenticated`).
-- 2. public.save_employee(): `p_compensation = {"clear": true}` deletes the compensation row, so an HR
--    user who empties every salary field really removes the record (previously the save succeeded
--    but the old salary silently stayed). Still security INVOKER: the delete needs the existing
--    employee_compensation delete policy (org `bank.edit`).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------------
-- 1. Identity / personal columns on INSERT need personal_data.edit
-- ---------------------------------------------------------------------------------------------------
create or replace function private.employees_insert_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if coalesce(
       new.national_id, new.id_type, new.iqama_issue_date::text, new.iqama_expiry_date::text,
       new.iqama_expiry_hijri, new.iqama_profession, new.passport_number, new.passport_expiry_date::text,
       new.date_of_birth::text, new.marital_status, new.address, new.personal_email,
       new.emergency_contact_name, new.emergency_contact_relationship, new.emergency_contact_mobile,
       new.employer_number, new.is_outside_kingdom::text
     ) is not null
     and not private.has_org_permission('personal_data', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.employees_insert_guard() from public, anon, authenticated;

drop trigger if exists employees_insert_guard on public.employees;
create trigger employees_insert_guard
  before insert on public.employees
  for each row execute function private.employees_insert_guard();

-- ---------------------------------------------------------------------------------------------------
-- 2. save_employee: {"clear": true} removes the compensation row
-- ---------------------------------------------------------------------------------------------------
create or replace function public.save_employee(
  p_employee_id uuid,
  p_employee jsonb,
  p_compensation jsonb default null,
  p_bank jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id   uuid := p_employee_id;
  v_old  public.employees;
  v_new  public.employees;
  v_bank uuid;
begin
  if not private.is_active_user() then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  if p_employee is null or jsonb_typeof(p_employee) <> 'object' then
    raise exception 'hr:errors.validation' using errcode = 'P0001';
  end if;

  if v_id is null then
    v_new := jsonb_populate_record(null::public.employees, p_employee);
    insert into public.employees (
      employee_number, name_ar, name_en, company_email, personal_email, mobile, alt_mobile, gender, nationality,
      date_of_birth, marital_status, address, department_id, division, section, job_title_id, grade, manager_id,
      employment_type, employment_status, joining_date, probation_end_date, contract_start_date, contract_end_date,
      termination_date, location_id, cost_center_id, national_id, id_type, iqama_issue_date, iqama_expiry_date,
      iqama_expiry_hijri, iqama_profession, passport_number, passport_expiry_date, employer_number,
      is_outside_kingdom, emergency_contact_name, emergency_contact_relationship, emergency_contact_mobile
    ) values (
      v_new.employee_number, v_new.name_ar, v_new.name_en, v_new.company_email, v_new.personal_email, v_new.mobile,
      v_new.alt_mobile, v_new.gender, v_new.nationality, v_new.date_of_birth, v_new.marital_status, v_new.address,
      v_new.department_id, v_new.division, v_new.section, v_new.job_title_id, v_new.grade, v_new.manager_id,
      v_new.employment_type, coalesce(v_new.employment_status, 'active'), v_new.joining_date, v_new.probation_end_date,
      v_new.contract_start_date, v_new.contract_end_date, v_new.termination_date, v_new.location_id,
      v_new.cost_center_id, v_new.national_id, v_new.id_type, v_new.iqama_issue_date, v_new.iqama_expiry_date,
      v_new.iqama_expiry_hijri, v_new.iqama_profession, v_new.passport_number, v_new.passport_expiry_date,
      v_new.employer_number, v_new.is_outside_kingdom, v_new.emergency_contact_name,
      v_new.emergency_contact_relationship, v_new.emergency_contact_mobile
    )
    returning id into v_id;
  else
    select * into v_old from public.employees e where e.id = v_id for update;
    if not found then
      raise exception 'hr:errors.notFound' using errcode = 'P0002';
    end if;
    -- keys absent from p_employee keep their current value
    v_new := jsonb_populate_record(v_old, p_employee);
    update public.employees set
      employee_number = v_new.employee_number, name_ar = v_new.name_ar, name_en = v_new.name_en,
      company_email = v_new.company_email, personal_email = v_new.personal_email, mobile = v_new.mobile,
      alt_mobile = v_new.alt_mobile, gender = v_new.gender, nationality = v_new.nationality,
      date_of_birth = v_new.date_of_birth, marital_status = v_new.marital_status, address = v_new.address,
      department_id = v_new.department_id, division = v_new.division, section = v_new.section,
      job_title_id = v_new.job_title_id, grade = v_new.grade, manager_id = v_new.manager_id,
      employment_type = v_new.employment_type, employment_status = coalesce(v_new.employment_status, 'active'),
      joining_date = v_new.joining_date, probation_end_date = v_new.probation_end_date,
      contract_start_date = v_new.contract_start_date, contract_end_date = v_new.contract_end_date,
      termination_date = v_new.termination_date, location_id = v_new.location_id,
      cost_center_id = v_new.cost_center_id, national_id = v_new.national_id, id_type = v_new.id_type,
      iqama_issue_date = v_new.iqama_issue_date, iqama_expiry_date = v_new.iqama_expiry_date,
      iqama_expiry_hijri = v_new.iqama_expiry_hijri, iqama_profession = v_new.iqama_profession,
      passport_number = v_new.passport_number, passport_expiry_date = v_new.passport_expiry_date,
      employer_number = v_new.employer_number, is_outside_kingdom = v_new.is_outside_kingdom,
      emergency_contact_name = v_new.emergency_contact_name,
      emergency_contact_relationship = v_new.emergency_contact_relationship,
      emergency_contact_mobile = v_new.emergency_contact_mobile
    where id = v_id;
  end if;

  if p_compensation is not null and jsonb_typeof(p_compensation) = 'object' then
    if coalesce((p_compensation ->> 'clear')::boolean, false) then
      delete from public.employee_compensation c where c.employee_id = v_id;
    else
      insert into public.employee_compensation as c (
        employee_id, basic_salary, housing_allowance, transport_allowance, other_allowance, currency, effective_date, notes
      ) values (
        v_id,
        coalesce((p_compensation ->> 'basic_salary')::numeric, 0),
        coalesce((p_compensation ->> 'housing_allowance')::numeric, 0),
        coalesce((p_compensation ->> 'transport_allowance')::numeric, 0),
        coalesce((p_compensation ->> 'other_allowance')::numeric, 0),
        coalesce(nullif(p_compensation ->> 'currency', ''), 'SAR'),
        nullif(p_compensation ->> 'effective_date', '')::date,
        nullif(btrim(p_compensation ->> 'notes'), '')
      )
      on conflict (employee_id) do update set
        basic_salary = excluded.basic_salary,
        housing_allowance = excluded.housing_allowance,
        transport_allowance = excluded.transport_allowance,
        other_allowance = excluded.other_allowance,
        currency = excluded.currency,
        effective_date = excluded.effective_date,
        notes = excluded.notes;
    end if;
  end if;

  if p_bank is not null and jsonb_typeof(p_bank) = 'object' then
    select b.id into v_bank from public.employee_bank_accounts b
    where b.employee_id = v_id and b.is_primary
    order by b.created_at
    limit 1;
    if coalesce(nullif(btrim(p_bank ->> 'bank_name'), ''), nullif(btrim(p_bank ->> 'iban'), ''),
                nullif(btrim(p_bank ->> 'account_holder'), '')) is null then
      if v_bank is not null then
        delete from public.employee_bank_accounts b where b.id = v_bank;
      end if;
    elsif v_bank is null then
      insert into public.employee_bank_accounts (employee_id, bank_name, iban, account_holder, is_primary)
      values (v_id, nullif(btrim(p_bank ->> 'bank_name'), ''), nullif(btrim(p_bank ->> 'iban'), ''),
              nullif(btrim(p_bank ->> 'account_holder'), ''), true);
    else
      update public.employee_bank_accounts b set
        bank_name = nullif(btrim(p_bank ->> 'bank_name'), ''),
        iban = nullif(btrim(p_bank ->> 'iban'), ''),
        account_holder = nullif(btrim(p_bank ->> 'account_holder'), '')
      where b.id = v_bank;
    end if;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.save_employee(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_employee(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
