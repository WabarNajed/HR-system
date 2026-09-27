-- M3 · Employees module: directory helpers, atomic save, manager hierarchy guard
--
-- 1. employees.search_norm: generated, Arabic-folded (hamza / ya / ta-marbuta, no diacritics) search
--    haystack (employee number, both names, company e-mail) with a trigram index, so the directory
--    finds "احمد" for "أحمد". The app normalises the query with the same rules.
-- 2. Manager hierarchy guard: an employee can't report to themselves or to one of their own
--    (indirect) reports. Raises hr:errors.managerCycle. Applies to every writer (UI, imports).
-- 3. public.employee_directory_stats(p_manager_id) → KPI counts for the directory (security invoker:
--    RLS decides which rows are counted; managers pass their own employee id to scope to reports).
-- 4. public.employee_filter_options() → managers + nationalities present in the visible rows.
-- 5. public.employee_manager_candidates(p_employee_id, p_query, p_limit) → manager picker options,
--    excluding the employee and all of their descendants (security invoker).
-- 6. public.save_employee(p_employee_id, p_employee, p_compensation, p_bank) → uuid: creates or
--    updates an employee together with compensation and the primary bank account in ONE transaction.
--    Security INVOKER on purpose: RLS policies and the guard triggers (personal_data.edit, bank.*)
--    apply exactly as for direct writes — nothing is widened.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------------------------------
-- 1. Arabic-folded search haystack
-- ---------------------------------------------------------------------------------------------------
alter table public.employees
  add column if not exists search_norm text generated always as (
    private.normalize_search(
      coalesce(employee_number, '') || ' ' || coalesce(name_ar, '') || ' ' ||
      coalesce(name_en, '') || ' ' || coalesce(company_email, '')
    )
  ) stored;
comment on column public.employees.search_norm is
  'Generated Arabic-folded haystack (private.normalize_search of number, names, company e-mail) with a trigram index — normalise the query the same way and use ilike.';
create index if not exists employees_search_norm_trgm_idx on public.employees using gin (search_norm extensions.gin_trgm_ops);
create index if not exists employees_archived_at_idx on public.employees (archived_at);
create index if not exists employees_nationality_idx on public.employees (nationality);

-- ---------------------------------------------------------------------------------------------------
-- 2. Manager hierarchy guard (definer: must see the whole chain regardless of the caller's scope)
-- ---------------------------------------------------------------------------------------------------
create or replace function private.employees_manager_cycle_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cursor uuid := new.manager_id;
  v_depth  int := 0;
begin
  if new.manager_id is null then
    return new;
  end if;
  if new.manager_id = new.id then
    raise exception 'hr:errors.managerCycle' using errcode = 'P0001', detail = 'manager_id';
  end if;
  while v_cursor is not null and v_depth < 200 loop
    select e.manager_id into v_cursor from public.employees e where e.id = v_cursor;
    if v_cursor = new.id then
      raise exception 'hr:errors.managerCycle' using errcode = 'P0001', detail = 'manager_id';
    end if;
    v_depth := v_depth + 1;
  end loop;
  return new;
end;
$$;
revoke all on function private.employees_manager_cycle_guard() from public, anon, authenticated;

drop trigger if exists employees_manager_cycle_guard on public.employees;
create trigger employees_manager_cycle_guard
  before insert or update of manager_id on public.employees
  for each row execute function private.employees_manager_cycle_guard();

-- ---------------------------------------------------------------------------------------------------
-- 3. Directory KPIs
-- ---------------------------------------------------------------------------------------------------
create or replace function public.employee_directory_stats(p_manager_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with e as (
    select
      e.employment_status,
      e.archived_at,
      e.iqama_expiry_date - private.org_today() as iqama_days,
      exists (select 1 from public.profiles p where p.employee_id = e.id) as has_portal
    from public.employees e
    where p_manager_id is null or e.manager_id = p_manager_id
  )
  -- aggregates without GROUP BY always return exactly one row (zeros for an empty directory)
  select jsonb_build_object(
    'total', count(*) filter (where e.archived_at is null),
    'active', count(*) filter (where e.archived_at is null and e.employment_status in ('active', 'probation', 'on_leave')),
    'probation', count(*) filter (where e.archived_at is null and e.employment_status = 'probation'),
    'on_leave', count(*) filter (where e.archived_at is null and e.employment_status = 'on_leave'),
    'iqama_expiring_30', count(*) filter (where e.archived_at is null and e.iqama_days between 0 and 30),
    'iqama_expired', count(*) filter (where e.archived_at is null and e.iqama_days < 0),
    'without_portal', count(*) filter (where e.archived_at is null and not e.has_portal),
    'archived', count(*) filter (where e.archived_at is not null),
    'today', private.org_today()
  )
  from e
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4. Filter options (managers and nationalities of the rows the caller can see)
-- ---------------------------------------------------------------------------------------------------
create or replace function public.employee_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'managers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'employee_number', m.employee_number, 'name_ar', m.name_ar, 'name_en', m.name_en)
             order by coalesce(nullif(m.name_ar, ''), m.name_en))
      from public.employees m
      where m.id in (select e.manager_id from public.employees e where e.manager_id is not null)
    ), '[]'::jsonb),
    'nationalities', coalesce((
      select jsonb_agg(x.nationality order by x.nationality)
      from (
        select distinct btrim(e.nationality) as nationality
        from public.employees e
        where nullif(btrim(e.nationality), '') is not null
      ) x
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5. Manager picker: excludes the employee and every (indirect) report of theirs
-- ---------------------------------------------------------------------------------------------------
create or replace function public.employee_manager_candidates(
  p_employee_id uuid default null,
  p_query text default null,
  p_limit int default 20
)
returns table (
  id uuid,
  employee_number text,
  name_ar text,
  name_en text,
  job_title_ar text,
  job_title_en text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive descendants as (
    select e.id, 1 as depth from public.employees e where p_employee_id is not null and e.id = p_employee_id
    union
    select c.id, d.depth + 1 from public.employees c join descendants d on c.manager_id = d.id where d.depth < 200
  ),
  q as (
    select nullif(private.normalize_search(btrim(coalesce(p_query, ''))), '') as term
  )
  select e.id, e.employee_number, e.name_ar, e.name_en, j.name_ar, j.name_en
  from public.employees e
  left join public.job_titles j on j.id = e.job_title_id
  cross join q
  where e.archived_at is null
    and e.employment_status not in ('resigned', 'terminated')
    and not exists (select 1 from descendants d where d.id = e.id)
    and (q.term is null
         or e.search_norm like '%' || replace(replace(replace(q.term, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by coalesce(nullif(e.name_ar, ''), e.name_en)
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6. Atomic create / update (security INVOKER: RLS + guard triggers apply unchanged)
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

-- ---------------------------------------------------------------------------------------------------
-- Privileges (Supabase grants EXECUTE on new functions to anon by default)
-- ---------------------------------------------------------------------------------------------------
revoke execute on function public.employee_directory_stats(uuid) from public, anon;
revoke execute on function public.employee_filter_options() from public, anon;
revoke execute on function public.employee_manager_candidates(uuid, text, int) from public, anon;
revoke execute on function public.save_employee(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.employee_directory_stats(uuid) to authenticated, service_role;
grant execute on function public.employee_filter_options() to authenticated, service_role;
grant execute on function public.employee_manager_candidates(uuid, text, int) to authenticated, service_role;
grant execute on function public.save_employee(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
