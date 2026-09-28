-- Employees: enforce column scope for identity / personal data in the database (not only in the UI).
--
-- Before: `employees_select` lets a line manager (team scope) read every column of their direct
-- reports' rows — national ID, passport, date of birth, address, emergency contacts and `extra_data`
-- (unmapped import columns, which may hold salary / IBAN / medical notes). `report_employee_rows`
-- returned national ID / passport number to any caller for every row RLS let them see.
--
-- After:
--   * `authenticated` may SELECT only the directory / employment / compliance columns of
--     public.employees (column privileges). Rows are still decided by RLS.
--   * The personal columns are readable only through `private.employee_personal` (security barrier,
--     definer view) which returns a value only for the employee themselves or an org-scoped holder of
--     `personal_data.view` / `personal_data.edit`; `extra_data` only for org `personal_data.view` or
--     `employees.create` (imports merge it).
--   * `public.employee_records` (security invoker) = the full employees row shape with those columns
--     masked per row. Code that needs personal columns reads this view instead of the table; RLS on
--     employees still decides which rows exist in it.
--   * Invoker RPCs that read the revoked columns now read them through the masked source
--     (`global_search`, `report_employee_rows`) or a checked definer helper (`save_employee`).
--
-- Compliance metadata that document-expiry tracking needs across modules (`id_type`,
-- `iqama_expiry_date`, `iqama_expiry_hijri`, `passport_expiry_date`) stays column-readable; it carries no
-- identity number or personal detail. Writes are unchanged (INSERT/UPDATE privileges and the
-- `employees_guard` personal_data.edit check still apply).
-- Idempotent.

-- ── 1. Masked personal-data source (definer view, never exposed through the Data API schema) ─────
create or replace view private.employee_personal
with (security_barrier = true) as
select
  e.id,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.personal_email end as personal_email,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.date_of_birth end as date_of_birth,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.marital_status end as marital_status,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.address end as address,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.national_id end as national_id,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.iqama_issue_date end as iqama_issue_date,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.iqama_profession end as iqama_profession,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.passport_number end as passport_number,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.employer_number end as employer_number,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.is_outside_kingdom end as is_outside_kingdom,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.emergency_contact_name end as emergency_contact_name,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.emergency_contact_relationship end as emergency_contact_relationship,
  case when e.id = (select private.current_employee_id())
         or (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('personal_data', 'edit'))
       then e.emergency_contact_mobile end as emergency_contact_mobile,
  case when (select private.has_org_permission('personal_data', 'view'))
         or (select private.has_org_permission('employees', 'create'))
       then e.extra_data end as extra_data
from public.employees e
where e.id = (select private.current_employee_id())
   or (select private.has_org_permission('personal_data', 'view'))
   or (select private.has_org_permission('personal_data', 'edit'))
   or (select private.has_org_permission('employees', 'create'));

comment on view private.employee_personal is
  'Personal / identity columns of employees, masked per row: self or org personal_data.view/edit (extra_data: org personal_data.view or employees.create). Read through public.employee_records.';

revoke all on private.employee_personal from public, anon, authenticated;
grant select on private.employee_personal to authenticated;

-- ── 2. Full employee row shape with the personal columns masked (RLS decides the rows) ───────────
create or replace view public.employee_records
with (security_invoker = true) as
select
  e.id, e.employee_number, e.name_ar, e.name_en, e.company_email, p.personal_email, e.mobile, e.alt_mobile,
  e.gender, e.nationality, p.date_of_birth, p.marital_status, p.address, e.department_id, e.division, e.section,
  e.job_title_id, e.grade, e.manager_id, e.employment_type, e.employment_status, e.joining_date,
  e.probation_end_date, e.contract_start_date, e.contract_end_date, e.termination_date, e.location_id,
  e.cost_center_id, p.national_id, e.id_type, p.iqama_issue_date, e.iqama_expiry_date, e.iqama_expiry_hijri,
  p.iqama_profession, p.passport_number, e.passport_expiry_date, p.employer_number, p.is_outside_kingdom,
  p.emergency_contact_name, p.emergency_contact_relationship, p.emergency_contact_mobile, e.avatar_path,
  p.extra_data, e.import_id, e.archived_at, e.archived_by, e.search_text, e.created_at, e.updated_at,
  e.created_by, e.updated_by, e.search_norm
from public.employees e
left join private.employee_personal p on p.id = e.id;

comment on view public.employee_records is
  'Read model of employees for code that needs identity / personal columns. Same rows as public.employees (RLS); personal columns are NULL unless the caller is the employee or holds org personal_data.view/edit; extra_data needs org personal_data.view or employees.create. Read-only.';

revoke all on public.employee_records from public, anon, authenticated;
grant select on public.employee_records to authenticated;
grant select on public.employee_records to service_role;

-- ── 3. Column privileges on the table ────────────────────────────────────────────────────────────
revoke select on public.employees from anon, authenticated;
grant select (
  id, employee_number, name_ar, name_en, company_email, mobile, alt_mobile, gender, nationality,
  department_id, division, section, job_title_id, grade, manager_id, employment_type, employment_status,
  joining_date, probation_end_date, contract_start_date, contract_end_date, termination_date, location_id,
  cost_center_id, id_type, iqama_expiry_date, iqama_expiry_hijri, passport_expiry_date, avatar_path,
  import_id, archived_at, archived_by, search_text, created_at, updated_at, created_by, updated_by, search_norm
) on public.employees to authenticated;

-- ── 4. save_employee: the current row (all columns) is read through a checked definer helper ──────
create or replace function private.employee_row_for_update(p_employee_id uuid)
returns public.employees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.employees;
begin
  -- Only the RPC's update path uses this; the row is merged and written back, never returned to the client.
  if not private.is_active_user() or not private.has_org_permission('employees', 'edit') then
    raise exception 'hr:errors.forbidden' using errcode = '42501';
  end if;
  select * into v from public.employees e where e.id = p_employee_id for update;
  return v;
end;
$$;
revoke all on function private.employee_row_for_update(uuid) from public, anon;
grant execute on function private.employee_row_for_update(uuid) to authenticated;

create or replace function public.save_employee(p_employee_id uuid, p_employee jsonb, p_compensation jsonb default null, p_bank jsonb default null)
returns uuid
language plpgsql
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
    v_old := private.employee_row_for_update(v_id);
    if v_old.id is null then
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

-- ── 5. global_search: national-ID matches through the masked source ─────────────────────────────
create or replace function public.global_search(p_query text, p_locale text default 'ar', p_limit integer default 20)
returns table(kind text, id uuid, title text, subtitle text, href text, type_key text)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q     text := btrim(coalesce(p_query, ''));
  v_norm  text;
  v_like  text;
  v_nid   uuid;
  v_en    boolean := p_locale = 'en';
  v_lim   int := least(greatest(coalesce(p_limit, 20), 1), 50);
begin
  if length(v_q) < 2 or not private.is_active_user() then
    return;
  end if;
  v_norm := private.normalize_search(v_q);
  v_like := '%' || replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  -- Exact national-ID match only for org personal_data.view (the masked source hides the rest).
  if private.has_org_permission('personal_data', 'view') then
    select p.id into v_nid from private.employee_personal p where p.national_id = v_q limit 1;
  end if;

  return query
  select 'employee'::text, e.id,
         case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end,
         concat_ws(' · ', e.employee_number,
                   case when v_en then coalesce(nullif(j.name_en, ''), j.name_ar) else coalesce(nullif(j.name_ar, ''), j.name_en) end),
         '/employees/' || e.id,
         null::text
  from public.employees e
  left join public.job_titles j on j.id = e.job_title_id
  where e.archived_at is null
    and (
      private.normalize_search(e.name_ar) like v_like
      or private.normalize_search(e.name_en) like v_like
      or lower(coalesce(e.employee_number, '')) like v_like
      or lower(coalesce(e.company_email, '')) like v_like
      or e.id = v_nid
    )
  order by (lower(coalesce(e.employee_number, '')) = lower(v_q)) desc, coalesce(e.id = v_nid, false) desc,
           coalesce(e.name_ar, e.name_en)
  limit v_lim;

  return query
  select 'request'::text, r.id, r.request_number,
         concat_ws(' · ',
                   case when v_en then coalesce(nullif(t.name_en, ''), t.name_ar) else coalesce(nullif(t.name_ar, ''), t.name_en) end,
                   case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end),
         '/requests/' || r.id,
         t.key
  from public.hr_requests r
  join public.request_types t on t.id = r.request_type_id
  join public.employees e on e.id = r.employee_id
  where r.request_number is not null and lower(r.request_number) like v_like
  order by r.created_at desc
  limit v_lim;

  return query
  select 'certificate'::text, c.id, c.certificate_number,
         concat_ws(' · ',
                   case when v_en then coalesce(nullif(e.name_en, ''), e.name_ar) else coalesce(nullif(e.name_ar, ''), e.name_en) end,
                   coalesce(
                     case when v_en then coalesce(nullif(ct.name_en, ''), ct.name_ar) else coalesce(nullif(ct.name_ar, ''), ct.name_en) end,
                     case c.certificate_type
                       when 'salary' then case when v_en then 'Salary certificate' else 'تعريف بالراتب' end
                       when 'employment' then case when v_en then 'Employment certificate' else 'شهادة تعريف بالعمل' end
                       when 'salary_employment' then case when v_en then 'Salary & employment certificate' else 'تعريف بالعمل والراتب' end
                       when 'experience' then case when v_en then 'Experience certificate' else 'شهادة خبرة' end
                       when 'custom' then case when v_en then 'Custom HR letter' else 'خطاب موارد بشرية مخصص' end
                     end)),
         '/certificates?q=' || c.certificate_number,
         c.certificate_type
  from public.certificates c
  join public.employees e on e.id = c.employee_id
  left join public.certificate_templates ct on ct.id = c.template_id
  where lower(c.certificate_number) like v_like
  order by c.created_at desc
  limit v_lim;
end;
$$;

-- ── 6. report_employee_rows: national ID / passport number through the masked source ────────────
create or replace function public.report_employee_rows(p_filters jsonb default '{}'::jsonb)
returns table(id uuid, employee_number text, name_ar text, name_en text, department_id uuid, department_ar text, department_en text, job_title_id uuid, job_title_ar text, job_title_en text, location_id uuid, location_ar text, location_en text, manager_id uuid, manager_name_ar text, manager_name_en text, nationality text, gender text, employment_type text, employment_status text, joining_date date, probation_end_date date, contract_end_date date, termination_date date, company_email text, mobile text, id_type text, national_id text, iqama_expiry_date date, iqama_expiry_hijri text, passport_number text, passport_expiry_date date, tenure_years numeric, is_archived boolean, employee_id uuid)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_emp uuid[] := private.report_uuid_list(f, 'employee_ids');
  v_dept uuid[] := private.report_uuid_list(f, 'department_ids');
  v_mgr uuid[] := private.report_uuid_list(f, 'manager_ids');
  v_loc uuid[] := private.report_uuid_list(f, 'location_ids');
  v_job uuid[] := private.report_uuid_list(f, 'job_title_ids');
  v_nat text[] := private.report_text_list(f, 'nationalities');
  v_status text[] := private.report_text_list(f, 'statuses');
  v_scope text := coalesce(f ->> 'scope', 'records');
  v_date_field text := coalesce(f ->> 'date_field', 'joining_date');
  v_from date := private.report_date(f, 'date_from');
  v_to date := private.report_date(f, 'date_to');
  v_today date := private.org_today();
begin
  return query
  select
    e.id, e.employee_number, e.name_ar, e.name_en,
    e.department_id, d.name_ar, d.name_en,
    e.job_title_id, j.name_ar, j.name_en,
    e.location_id, l.name_ar, l.name_en,
    e.manager_id, m.name_ar, m.name_en,
    nullif(btrim(e.nationality), ''), e.gender, e.employment_type, e.employment_status,
    e.joining_date, e.probation_end_date, e.contract_end_date, e.termination_date,
    e.company_email, e.mobile,
    e.id_type, pd.national_id, e.iqama_expiry_date, e.iqama_expiry_hijri, pd.passport_number, e.passport_expiry_date,
    case when e.joining_date is not null
      then round(greatest(least(coalesce(e.termination_date, v_today), v_today) - e.joining_date, 0) / 365.25, 1)
    end,
    e.archived_at is not null,
    e.id
  from public.employees e
  left join private.employee_personal pd on pd.id = e.id
  left join public.departments d on d.id = e.department_id
  left join public.job_titles j on j.id = e.job_title_id
  left join public.locations l on l.id = e.location_id
  left join public.employees m on m.id = e.manager_id
  where
    (case v_scope
       when 'all' then true
       when 'leavers' then e.termination_date is not null or e.employment_status in ('resigned', 'terminated')
       when 'current' then e.archived_at is null and e.employment_status not in ('resigned', 'terminated')
       else e.archived_at is null
     end)
    and (v_emp is null or e.id = any (v_emp))
    and (v_dept is null or e.department_id = any (v_dept))
    and (v_mgr is null or e.manager_id = any (v_mgr))
    and (v_loc is null or e.location_id = any (v_loc))
    and (v_job is null or e.job_title_id = any (v_job))
    and (v_nat is null or nullif(btrim(e.nationality), '') = any (v_nat))
    and (v_status is null or e.employment_status = any (v_status))
    and (v_from is null or (case when v_date_field = 'termination_date' then e.termination_date else e.joining_date end) >= v_from)
    and (v_to is null or (case when v_date_field = 'termination_date' then e.termination_date else e.joining_date end) <= v_to);
end;
$$;
