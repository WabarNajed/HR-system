import { EMPTY_EMPLOYEE_FORM, type EmployeeFormValues } from './schemas';
import type { CompensationRecord, EmployeeRecord } from './types';

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? '' : String(v));

/** Employee record (+ compensation / bank for bank.edit viewers) → edit form values. */
export function toEmployeeFormValues(
  e: EmployeeRecord,
  compensation: CompensationRecord | null,
  bank: { bank_name: string | null; iban: string | null; account_holder: string | null } | null,
): EmployeeFormValues {
  const pick = <T extends string>(value: string | null, allowed: readonly T[] | null = null): T | '' =>
    value && (!allowed || allowed.includes(value as T)) ? (value as T) : '';
  return {
    ...EMPTY_EMPLOYEE_FORM,
    employee_number: s(e.employee_number),
    name_ar: s(e.name_ar),
    name_en: s(e.name_en),
    company_email: s(e.company_email),
    personal_email: s(e.personal_email),
    mobile: s(e.mobile),
    alt_mobile: s(e.alt_mobile),
    gender: pick(e.gender, ['male', 'female']),
    nationality: s(e.nationality),
    date_of_birth: s(e.date_of_birth),
    marital_status: pick(e.marital_status, ['single', 'married', 'divorced', 'widowed']),
    address: s(e.address),
    department_id: s(e.department_id),
    division: s(e.division),
    section: s(e.section),
    job_title_id: s(e.job_title_id),
    grade: s(e.grade),
    manager_id: s(e.manager_id),
    employment_type: pick(e.employment_type, ['full_time', 'part_time', 'contract', 'temporary', 'intern']),
    employment_status: (e.employment_status as EmployeeFormValues['employment_status']) || 'active',
    joining_date: s(e.joining_date),
    probation_end_date: s(e.probation_end_date),
    contract_start_date: s(e.contract_start_date),
    contract_end_date: s(e.contract_end_date),
    termination_date: s(e.termination_date),
    location_id: s(e.location_id),
    cost_center_id: s(e.cost_center_id),
    id_type: pick(e.id_type, ['iqama', 'national_id']),
    national_id: s(e.national_id),
    iqama_issue_date: s(e.iqama_issue_date),
    iqama_expiry_date: s(e.iqama_expiry_date),
    iqama_expiry_hijri: s(e.iqama_expiry_hijri),
    iqama_profession: s(e.iqama_profession),
    passport_number: s(e.passport_number),
    passport_expiry_date: s(e.passport_expiry_date),
    employer_number: s(e.employer_number),
    is_outside_kingdom: e.is_outside_kingdom === null ? '' : e.is_outside_kingdom ? 'outside' : 'inside',
    emergency_contact_name: s(e.emergency_contact_name),
    emergency_contact_relationship: s(e.emergency_contact_relationship),
    emergency_contact_mobile: s(e.emergency_contact_mobile),
    basic_salary: compensation ? s(Number(compensation.basic_salary)) : '',
    housing_allowance: compensation ? s(Number(compensation.housing_allowance)) : '',
    transport_allowance: compensation ? s(Number(compensation.transport_allowance)) : '',
    other_allowance: compensation ? s(Number(compensation.other_allowance)) : '',
    compensation_effective_date: s(compensation?.effective_date),
    bank_name: s(bank?.bank_name),
    iban: s(bank?.iban),
    account_holder: s(bank?.account_holder),
  };
}
