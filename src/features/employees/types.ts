/**
 * Employees module — shared (isomorphic) constants and row types.
 */

export const EMPLOYMENT_STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary', 'intern'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const ID_TYPES = ['iqama', 'national_id'] as const;
export type IdType = (typeof ID_TYPES)[number];

export const RELATIONSHIPS = ['spouse', 'son', 'daughter', 'father', 'mother', 'other'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const DEPENDENT_INSURANCE_STATUSES = ['insured', 'not_insured', 'pending'] as const;
export type DependentInsuranceStatus = (typeof DEPENDENT_INSURANCE_STATUSES)[number];

export const INSURANCE_STATUSES = ['active', 'expired', 'pending', 'cancelled'] as const;
export type InsuranceStatus = (typeof INSURANCE_STATUSES)[number];

/** Directory "Iqama expiry" filter buckets (cumulative windows from today). */
export const IQAMA_FILTER_BUCKETS = ['expired', 'within30', 'within60', 'within90', 'valid', 'missing'] as const;
export type IqamaFilterBucket = (typeof IQAMA_FILTER_BUCKETS)[number];

export const PROFILE_TABS = [
  'overview',
  'employment',
  'personal',
  'leave',
  'documents',
  'requests',
  'certificates',
  'dependents',
  'insurance',
  'activity',
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export type NamedRef = { id: string; name_ar: string | null; name_en: string | null };

/** One row of the directory table (what the list query selects). */
export type DirectoryRow = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  company_email: string | null;
  mobile: string | null;
  nationality: string | null;
  employment_status: string;
  employment_type: string | null;
  joining_date: string | null;
  /** Null for viewers that must not see government-ID data (managers). */
  iqama_expiry_date: string | null;
  avatar_path: string | null;
  archived_at: string | null;
  manager_id: string | null;
  department: NamedRef | null;
  job_title: NamedRef | null;
  location: NamedRef | null;
  manager: { id: string; name_ar: string | null; name_en: string | null; employee_number: string | null } | null;
  /** Linked portal account (null when the employee has none or the viewer can't see it). */
  portal: { id: string; status: string } | null;
};

export type DirectoryStats = {
  total: number;
  active: number;
  probation: number;
  on_leave: number;
  iqama_expiring_30: number;
  iqama_expired: number;
  without_portal: number;
  archived: number;
  today: string;
};

export type Option = { value: string; label: string; description?: string; keywords?: string[] };

export type MasterDataOptions = {
  departments: Option[];
  jobTitles: Option[];
  locations: Option[];
  costCenters: Option[];
};

/** Full employee record as loaded for the profile and edit pages. */
export type EmployeeRecord = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  company_email: string | null;
  personal_email: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  gender: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  marital_status: string | null;
  address: string | null;
  department_id: string | null;
  division: string | null;
  section: string | null;
  job_title_id: string | null;
  grade: string | null;
  manager_id: string | null;
  employment_type: string | null;
  employment_status: string;
  joining_date: string | null;
  probation_end_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  termination_date: string | null;
  location_id: string | null;
  cost_center_id: string | null;
  national_id: string | null;
  id_type: string | null;
  iqama_issue_date: string | null;
  iqama_expiry_date: string | null;
  iqama_expiry_hijri: string | null;
  iqama_profession: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  employer_number: string | null;
  is_outside_kingdom: boolean | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_mobile: string | null;
  avatar_path: string | null;
  archived_at: string | null;
  /** Unmapped import columns preserved verbatim (org viewers only). */
  extra_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  department: NamedRef | null;
  job_title: NamedRef | null;
  location: (NamedRef & { city: string | null }) | null;
  cost_center: NamedRef | null;
};

export type ManagerCard = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  job_title_ar: string | null;
  job_title_en: string | null;
  company_email: string | null;
  avatar_path: string | null;
};

export type CompensationRecord = {
  basic_salary: number;
  housing_allowance: number;
  transport_allowance: number;
  other_allowance: number;
  total_salary: number | null;
  currency: string;
  effective_date: string | null;
  notes: string | null;
};

export type BankRecord = {
  id: string;
  bank_name: string | null;
  /** Masked for display (`•••• 1234`) — the full IBAN is only sent on explicit reveal. */
  iban_masked: string | null;
  has_iban: boolean;
  account_holder: string | null;
};

export type DependentRecord = {
  id: string;
  employee_id: string;
  name_ar: string | null;
  name_en: string | null;
  relationship: string;
  date_of_birth: string | null;
  nationality: string | null;
  national_id: string | null;
  iqama_expiry_date: string | null;
  passport_number: string | null;
  passport_expiry_date: string | null;
  insurance_status: string | null;
  insurance_member_number: string | null;
  notes: string | null;
};

export type InsuranceRecord = {
  id: string;
  employee_id: string;
  dependent_id: string | null;
  provider: string | null;
  policy_number: string | null;
  class: string | null;
  member_number: string | null;
  start_date: string | null;
  expiry_date: string | null;
  status: string;
};
