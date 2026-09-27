-- =====================================================================================================
-- HR Portal — data model (ARCHITECTURE.md §6)
-- Conventions: uuid PKs, created_at/updated_at/created_by/updated_by (trigger maintained), text + CHECK
-- instead of enums, every FK indexed, bilingual *_ar / *_en columns.
-- =====================================================================================================

-- ---------------------------------------------------------------------------------------------------
-- Organization & settings
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.organizations (
  id                       uuid primary key default gen_random_uuid(),
  singleton                boolean not null default true unique check (singleton),
  name_ar                  text,
  name_en                  text,
  legal_name_ar            text,
  legal_name_en            text,
  logo_path                text,
  address_ar               text,
  address_en               text,
  city                     text,
  country                  text,
  website                  text,
  phone                    text,
  hr_email                 text,
  commercial_registration  text,
  vat_number               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid default auth.uid(),
  updated_by               uuid default auth.uid()
);
comment on table public.organizations is 'Singleton: the organization using this deployment (identity, contact, legal).';

create table if not exists public.organization_settings (
  id                       uuid primary key default gen_random_uuid(),
  singleton                boolean not null default true unique check (singleton),
  currency                 text not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  timezone                 text not null default 'Asia/Riyadh',
  default_language         text not null default 'ar' check (default_language in ('ar', 'en')),
  working_days             int[] not null default '{0,1,2,3,4}' check (working_days <@ '{0,1,2,3,4,5,6}'::int[]),
  weekend_days             int[] not null default '{5,6}' check (weekend_days <@ '{0,1,2,3,4,5,6}'::int[]),
  work_start               time not null default '08:00',
  work_end                 time not null default '17:00',
  fiscal_year_start_month  int not null default 1 check (fiscal_year_start_month between 1 and 12),
  portal_name_ar           text not null default 'بوابة الموارد البشرية',
  portal_name_en           text not null default 'HR Portal',
  primary_color            text not null default '#0F5E6B' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color          text not null default '#B8862F' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  login_title_ar           text,
  login_title_en           text,
  login_subtitle_ar        text,
  login_subtitle_en        text,
  login_image_path         text,
  stamp_path               text,
  signature_path           text,
  signatory_name_ar        text,
  signatory_name_en        text,
  signatory_title_ar       text,
  signatory_title_en       text,
  allow_self_registration  boolean not null default true,
  session_timeout_minutes  int not null default 480 check (session_timeout_minutes between 5 and 10080),
  email_from_name          text,
  email_reply_to           text,
  expiry_alert_days        int[] not null default '{90,60,30,14,7}',
  setup_completed_at       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid default auth.uid(),
  updated_by               uuid default auth.uid()
);
comment on table public.organization_settings is 'Singleton: regional settings, working schedule, branding, security. Day numbers: 0=Sunday … 6=Saturday.';

create table if not exists public.system_settings (
  key          text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  value        jsonb not null default 'null'::jsonb,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid default auth.uid(),
  updated_by   uuid default auth.uid()
);
comment on table public.system_settings is 'Misc feature flags (readable by every active user — never store secrets here).';

-- ---------------------------------------------------------------------------------------------------
-- Roles (profiles/user_roles are created after employees)
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.roles (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique check (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  name_ar         text not null,
  name_en         text not null,
  description_ar  text,
  description_en  text,
  is_system       boolean not null default false,
  rank            int not null default 10,
  data_scope      text not null default 'own' check (data_scope in ('own', 'team', 'organization')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);
comment on column public.roles.data_scope is
  'Which rows a role''s permissions apply to: own (self only), team (self + direct reports — managers see reports structurally anyway), organization (all rows; HR roles). RLS grants org-wide access only through roles with data_scope = organization.';

-- ---------------------------------------------------------------------------------------------------
-- Organization structure
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.departments (
  id                uuid primary key default gen_random_uuid(),
  code              text unique check (code is null or btrim(code) <> ''),
  name_ar           text,
  name_en           text,
  parent_id         uuid references public.departments (id) on delete set null,
  head_employee_id  uuid,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid(),
  constraint departments_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null),
  constraint departments_parent_not_self check (parent_id is distinct from id)
);

create table if not exists public.job_titles (
  id          uuid primary key default gen_random_uuid(),
  code        text unique check (code is null or btrim(code) <> ''),
  name_ar     text,
  name_en     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  constraint job_titles_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null)
);

create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  code        text unique check (code is null or btrim(code) <> ''),
  name_ar     text,
  name_en     text,
  city        text,
  country     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  constraint locations_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null)
);

create table if not exists public.cost_centers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique check (code is null or btrim(code) <> ''),
  name_ar     text,
  name_en     text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  constraint cost_centers_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null)
);

-- ---------------------------------------------------------------------------------------------------
-- Imports (referenced by employees.import_id)
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.imports (
  id             uuid primary key default gen_random_uuid(),
  import_type    text not null check (import_type in ('employees', 'departments', 'job_titles', 'locations',
                   'cost_centers', 'leave_balances', 'dependents', 'insurance', 'documents', 'public_holidays')),
  file_name      text not null,
  status         text not null default 'uploaded'
                   check (status in ('uploaded', 'validated', 'importing', 'completed', 'failed', 'cancelled')),
  total_rows     int not null default 0 check (total_rows >= 0),
  valid_rows     int not null default 0 check (valid_rows >= 0),
  warning_rows   int not null default 0 check (warning_rows >= 0),
  error_rows     int not null default 0 check (error_rows >= 0),
  imported_rows  int not null default 0 check (imported_rows >= 0),
  mapping        jsonb not null default '{}'::jsonb,
  options        jsonb not null default '{}'::jsonb,
  summary        jsonb not null default '{}'::jsonb,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_by     uuid default auth.uid()
);

-- ---------------------------------------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.employees (
  id                              uuid primary key default gen_random_uuid(),
  employee_number                 text unique check (employee_number is null or btrim(employee_number) <> ''),
  name_ar                         text,
  name_en                         text,
  company_email                   text check (company_email is null or company_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  personal_email                  text check (personal_email is null or personal_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  mobile                          text,
  alt_mobile                      text,
  gender                          text check (gender in ('male', 'female')),
  nationality                     text,
  date_of_birth                   date,
  marital_status                  text check (marital_status in ('single', 'married', 'divorced', 'widowed')),
  address                         text,
  department_id                   uuid references public.departments (id) on delete set null,
  division                        text,
  section                         text,
  job_title_id                    uuid references public.job_titles (id) on delete set null,
  grade                           text,
  manager_id                      uuid references public.employees (id) on delete set null,
  employment_type                 text check (employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'intern')),
  employment_status               text not null default 'active'
                                    check (employment_status in ('active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated')),
  joining_date                    date,
  probation_end_date              date,
  contract_start_date             date,
  contract_end_date               date,
  termination_date                date,
  location_id                     uuid references public.locations (id) on delete set null,
  cost_center_id                  uuid references public.cost_centers (id) on delete set null,
  national_id                     text unique check (national_id is null or btrim(national_id) <> ''),
  id_type                         text check (id_type in ('iqama', 'national_id')),
  iqama_issue_date                date,
  iqama_expiry_date               date,
  iqama_expiry_hijri              text,
  iqama_profession                text,
  passport_number                 text,
  passport_expiry_date            date,
  employer_number                 text,
  is_outside_kingdom              boolean,
  emergency_contact_name          text,
  emergency_contact_relationship  text,
  emergency_contact_mobile        text,
  avatar_path                     text,
  extra_data                      jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_data) = 'object'),
  import_id                       uuid references public.imports (id) on delete set null,
  archived_at                     timestamptz,
  archived_by                     uuid,
  search_text                     text generated always as (
                                    lower(
                                      coalesce(employee_number, '') || ' ' || coalesce(name_ar, '') || ' ' ||
                                      coalesce(name_en, '') || ' ' || coalesce(company_email, '')
                                    )
                                  ) stored,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  created_by                      uuid default auth.uid(),
  updated_by                      uuid default auth.uid(),
  constraint employees_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null),
  constraint employees_manager_not_self check (manager_id is distinct from id),
  constraint employees_contract_dates check (contract_end_date is null or contract_start_date is null or contract_end_date >= contract_start_date),
  constraint employees_avatar_path_check check (avatar_path is null or avatar_path like id::text || '/avatar/%')
);
comment on column public.employees.search_text is 'Generated lower-case haystack (employee_number, names, company email) with a pg_trgm GIN index — use .ilike(''search_text'', ''%q%'').';
comment on column public.employees.extra_data is 'Unmapped import columns preserved verbatim.';

alter table public.departments
  drop constraint if exists departments_head_employee_id_fkey,
  add constraint departments_head_employee_id_fkey
    foreign key (head_employee_id) references public.employees (id) on delete set null;

-- ---------------------------------------------------------------------------------------------------
-- Identity & access
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.profiles (
  id                            uuid primary key references auth.users (id) on delete cascade,
  email                         text,
  full_name                     text,
  mobile                        text,
  employee_id                   uuid unique references public.employees (id) on delete set null,
  status                        text not null default 'pending'
                                  check (status in ('pending', 'info_requested', 'active', 'rejected', 'disabled')),
  registration_employee_number  text,
  registration_note             text,
  matched_employee_id           uuid references public.employees (id) on delete set null,
  review_note                   text,
  reviewed_by                   uuid references public.profiles (id) on delete set null,
  reviewed_at                   timestamptz,
  preferred_language            text check (preferred_language in ('ar', 'en')),
  theme                         text not null default 'system' check (theme in ('light', 'dark', 'system')),
  last_login_at                 timestamptz,
  invited_at                    timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid,
  updated_by                    uuid
);
comment on column public.profiles.matched_employee_id is 'Registration helper: employee suggested by matching the registration input against employee_number / national_id. Untrusted suggestion only.';
comment on column public.profiles.review_note is 'HR note for the applicant (rejection reason / information requested).';

create table if not exists public.user_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  unique (user_id, role_id)
);

create table if not exists public.role_permissions (
  id          uuid primary key default gen_random_uuid(),
  role_id     uuid not null references public.roles (id) on delete cascade,
  module      text not null check (module in ('employees', 'personal_data', 'bank', 'insurance', 'documents', 'requests',
                'approvals', 'leave', 'certificates', 'reports', 'settings', 'audit', 'users')),
  action      text not null check (action in ('view', 'create', 'edit', 'approve', 'export', 'administer')),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  unique (role_id, module, action)
);

-- ---------------------------------------------------------------------------------------------------
-- Employee sub-records
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.employee_compensation (
  employee_id          uuid primary key references public.employees (id) on delete cascade,
  basic_salary         numeric(12, 2) not null default 0 check (basic_salary >= 0),
  housing_allowance    numeric(12, 2) not null default 0 check (housing_allowance >= 0),
  transport_allowance  numeric(12, 2) not null default 0 check (transport_allowance >= 0),
  other_allowance      numeric(12, 2) not null default 0 check (other_allowance >= 0),
  total_salary         numeric(12, 2) generated always as (basic_salary + housing_allowance + transport_allowance + other_allowance) stored,
  currency             text not null default 'SAR' check (currency ~ '^[A-Z]{3}$'),
  effective_date       date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid default auth.uid(),
  updated_by           uuid default auth.uid()
);

create table if not exists public.employee_bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete cascade,
  bank_name       text,
  iban            text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  account_holder  text,
  is_primary      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);
comment on column public.employee_bank_accounts.iban is 'Normalised by trigger: upper-case, no spaces.';

create table if not exists public.employee_dependents (
  id                       uuid primary key default gen_random_uuid(),
  employee_id              uuid not null references public.employees (id) on delete cascade,
  name_ar                  text,
  name_en                  text,
  relationship             text not null check (relationship in ('spouse', 'son', 'daughter', 'father', 'mother', 'other')),
  date_of_birth            date,
  nationality              text,
  national_id              text,
  iqama_expiry_date        date,
  passport_number          text,
  passport_expiry_date     date,
  insurance_status         text check (insurance_status in ('insured', 'not_insured', 'pending')),
  insurance_member_number  text,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid default auth.uid(),
  updated_by               uuid default auth.uid(),
  constraint employee_dependents_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null)
);

create table if not exists public.employee_insurance (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees (id) on delete cascade,
  dependent_id   uuid references public.employee_dependents (id) on delete cascade,
  provider       text,
  policy_number  text,
  class          text,
  member_number  text,
  start_date     date,
  expiry_date    date,
  status         text not null default 'active' check (status in ('active', 'expired', 'pending', 'cancelled')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_by     uuid default auth.uid()
);

create table if not exists public.employee_documents (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete cascade,
  document_type    text not null check (document_type in ('employment_contract', 'national_id', 'iqama', 'passport',
                     'medical_insurance', 'iban_certificate', 'educational_certificate', 'professional_certificate',
                     'medical_report', 'visa', 'signed_hr_form', 'other')),
  document_number  text,
  issue_date       date,
  expiry_date      date,
  status           text not null default 'valid' check (status in ('valid', 'expired', 'pending_review', 'rejected', 'archived')),
  storage_path     text unique,
  file_name        text,
  file_size        bigint check (file_size is null or file_size >= 0),
  mime_type        text,
  notes            text,
  is_confidential  boolean not null default false,
  uploaded_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  -- the file must live in the document's own folder (storage policies and download routes rely on it)
  constraint employee_documents_storage_path_check
    check (storage_path is null or storage_path like employee_id::text || '/' || id::text || '/%')
);
comment on column public.employee_documents.storage_path is 'Bucket employee-documents, path {employee_id}/{document_id}/{file}.';
comment on column public.employee_documents.is_confidential is 'Forced to true on insert for medical_report; confidential documents are hidden from the owner unless they uploaded them.';

-- ---------------------------------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.leave_types (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[a-z][a-z0-9_]{0,62}$'),
  name_ar               text not null,
  name_en               text not null,
  description_ar        text,
  description_en        text,
  is_paid               boolean not null default true,
  deducts_balance       boolean not null default false,
  default_entitlement   numeric(6, 2) not null default 0 check (default_entitlement >= 0),
  max_days_per_request  numeric(6, 2) check (max_days_per_request is null or max_days_per_request > 0),
  day_count_basis       text not null default 'working' check (day_count_basis in ('working', 'calendar')),
  requires_attachment   boolean not null default false,
  gender_restriction    text check (gender_restriction in ('male', 'female')),
  color                 text not null default '#0F5E6B' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order            int not null default 0,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  updated_by            uuid default auth.uid()
);

create table if not exists public.public_holidays (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text,
  name_en     text,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_by  uuid default auth.uid(),
  constraint public_holidays_dates check (end_date >= start_date),
  constraint public_holidays_name_required check (coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_en), '')) is not null)
);

create table if not exists public.leave_balances (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.employees (id) on delete cascade,
  leave_type_id    uuid not null references public.leave_types (id) on delete restrict,
  year             int not null check (year between 2000 and 2200),
  opening_balance  numeric(7, 2) not null default 0,
  entitlement      numeric(7, 2) not null default 0,
  adjustment       numeric(7, 2) not null default 0,
  used             numeric(7, 2) not null default 0 check (used >= 0),
  pending          numeric(7, 2) not null default 0 check (pending >= 0),
  remaining        numeric(8, 2) generated always as (opening_balance + entitlement + adjustment - used) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  unique (employee_id, leave_type_id, year)
);
comment on column public.leave_balances.remaining is 'opening_balance + entitlement + adjustment − used (pending is NOT subtracted; available = remaining − pending).';

create table if not exists public.leave_adjustments (
  id                uuid primary key default gen_random_uuid(),
  leave_balance_id  uuid not null references public.leave_balances (id) on delete cascade,
  amount            numeric(7, 2) not null check (amount <> 0),
  reason            text not null check (btrim(reason) <> ''),
  old_remaining     numeric(8, 2),
  new_remaining     numeric(8, 2),
  changed_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  changed_at        timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------------
-- Requests & workflow configuration
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.request_types (
  id                         uuid primary key default gen_random_uuid(),
  key                        text not null unique check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  category                   text not null default 'general' check (category ~ '^[a-z][a-z0-9_]{0,62}$'),
  name_ar                    text not null,
  name_en                    text not null,
  description_ar             text,
  description_en             text,
  icon                       text not null default 'file-text',
  color                      text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  sla_business_days          int check (sla_business_days is null or sla_business_days >= 0),
  requires_manager_approval  boolean not null default false,
  requires_hr_approval       boolean not null default true,
  allow_attachments          boolean not null default true,
  is_active                  boolean not null default true,
  sort_order                 int not null default 0,
  workflow_id                uuid,
  is_system                  boolean not null default false,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid default auth.uid(),
  updated_by                 uuid default auth.uid()
);
comment on column public.request_types.is_system is 'Seeded types whose keys drive built-in effects (leave, certificate, bank_update, employee_info_update); cannot be deleted, only deactivated.';

create table if not exists public.request_fields (
  id               uuid primary key default gen_random_uuid(),
  request_type_id  uuid not null references public.request_types (id) on delete cascade,
  key              text not null check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  field_type       text not null check (field_type in ('short_text', 'long_text', 'number', 'currency', 'date', 'datetime',
                     'time', 'dropdown', 'multi_select', 'yes_no', 'attachment', 'leave_type', 'dependent', 'employee',
                     'email', 'phone')),
  label_ar         text not null,
  label_en         text not null,
  help_ar          text,
  help_en          text,
  placeholder_ar   text,
  placeholder_en   text,
  required         boolean not null default false,
  options          jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  sort_order       int not null default 0,
  visibility       jsonb check (visibility is null or jsonb_typeof(visibility) = 'object'),
  validation       jsonb not null default '{}'::jsonb check (jsonb_typeof(validation) = 'object'),
  is_active        boolean not null default true,
  is_system        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid(),
  unique (request_type_id, key)
);
comment on column public.request_fields.options is '[{"value": "...", "label_ar": "...", "label_en": "..."}]';
comment on column public.request_fields.visibility is
  'NULL = always visible. Rule: {"field": "<key>|subtype", "in": [..]} | {"field": .., "not_in": [..]} | {"all": [rule..]} | {"any": [rule..]}.';

create table if not exists public.request_workflows (
  id               uuid primary key default gen_random_uuid(),
  request_type_id  uuid not null references public.request_types (id) on delete cascade,
  name_ar          text not null,
  name_en          text not null,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid default auth.uid(),
  updated_by       uuid default auth.uid()
);

alter table public.request_types
  drop constraint if exists request_types_workflow_id_fkey,
  add constraint request_types_workflow_id_fkey
    foreign key (workflow_id) references public.request_workflows (id) on delete set null;

create table if not exists public.request_workflow_steps (
  id                 uuid primary key default gen_random_uuid(),
  workflow_id        uuid not null references public.request_workflows (id) on delete cascade,
  step_order         int not null check (step_order > 0),
  step_type          text not null check (step_type in ('manager', 'hr', 'role', 'user')),
  name_ar            text not null,
  name_en            text not null,
  approver_role_key  text references public.roles (key) on update cascade on delete set null,
  approver_user_id   uuid references public.profiles (id) on delete set null,
  sla_business_days  int check (sla_business_days is null or sla_business_days >= 0),
  can_return         boolean not null default true,
  can_reassign       boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid(),
  updated_by         uuid default auth.uid(),
  constraint request_workflow_steps_order_unique unique (workflow_id, step_order) deferrable initially immediate,
  constraint request_workflow_steps_role_needs_key check (step_type <> 'role' or approver_role_key is not null),
  constraint request_workflow_steps_user_needs_user check (step_type <> 'user' or approver_user_id is not null)
);

-- ---------------------------------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.hr_requests (
  id                        uuid primary key default gen_random_uuid(),
  request_number            text unique,
  request_type_id           uuid not null references public.request_types (id) on delete restrict,
  subtype                   text,
  employee_id               uuid not null references public.employees (id) on delete cascade,
  requester_id              uuid references public.profiles (id) on delete set null,
  status                    text not null default 'draft' check (status in ('draft', 'submitted', 'pending_manager_approval',
                              'pending_hr_review', 'returned', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled')),
  current_step_id           uuid references public.request_workflow_steps (id) on delete set null,
  current_step_order        int,
  current_step_type         text check (current_step_type in ('manager', 'hr', 'role', 'user')),
  returned_from_step_order  int,
  assigned_to               uuid references public.profiles (id) on delete set null,
  current_approver_id       uuid references public.profiles (id) on delete set null,
  priority                  text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  submitted_at              timestamptz,
  due_at                    timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz,
  title                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid default auth.uid(),
  updated_by                uuid default auth.uid()
);
comment on column public.hr_requests.request_number is 'HR-YYYY-000001, assigned on first submission (drafts have none).';
comment on column public.hr_requests.current_step_type is 'Type of the workflow step the request is waiting on (NULL when not pending).';

create table if not exists public.hr_request_values (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.hr_requests (id) on delete cascade,
  field_key   text not null,
  value       jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (request_id, field_key)
);

create table if not exists public.request_attachments (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.hr_requests (id) on delete cascade,
  field_key     text,
  storage_path  text not null unique,
  file_name     text not null,
  file_size     bigint check (file_size is null or file_size >= 0),
  mime_type     text,
  uploaded_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint request_attachments_storage_path_check
    check (storage_path like 'requests/' || request_id::text || '/%')
);
comment on column public.request_attachments.storage_path is 'Bucket request-attachments, path requests/{request_id}/{uuid}-{file}.';

create table if not exists public.request_comments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.hr_requests (id) on delete cascade,
  author_id    uuid references public.profiles (id) on delete set null,
  author_name  text,
  body         text not null check (btrim(body) <> ''),
  is_internal  boolean not null default false,
  created_at   timestamptz not null default clock_timestamp()
);

create table if not exists public.request_history (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.hr_requests (id) on delete cascade,
  action       text not null,
  from_status  text,
  to_status    text,
  actor_id     uuid references public.profiles (id) on delete set null,
  actor_name   text,
  note         text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default clock_timestamp()
);

create table if not exists public.request_approvals (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.hr_requests (id) on delete cascade,
  step_id        uuid references public.request_workflow_steps (id) on delete set null,
  step_order     int not null,
  step_type      text not null check (step_type in ('manager', 'hr', 'role', 'user')),
  approver_id    uuid references public.profiles (id) on delete set null,
  approver_name  text,
  decision       text not null default 'pending'
                   check (decision in ('pending', 'approved', 'rejected', 'returned', 'reassigned', 'skipped')),
  comment        text,
  decided_at     timestamptz,
  created_at     timestamptz not null default clock_timestamp()
);
-- at most one open approval per request (idempotency guard for concurrent actions)
create unique index if not exists request_approvals_one_pending on public.request_approvals (request_id) where decision = 'pending';

create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique references public.hr_requests (id) on delete cascade,
  employee_id     uuid not null references public.employees (id) on delete cascade,
  leave_type_id   uuid not null references public.leave_types (id) on delete restrict,
  start_date      date not null,
  end_date        date not null,
  return_date     date,
  days            numeric(6, 2) not null check (days > 0),
  balance_effect  text not null default 'none' check (balance_effect in ('none', 'pending', 'used', 'reversed')),
  year            int not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint leave_requests_dates check (end_date >= start_date)
);
comment on column public.leave_requests.balance_effect is 'none → pending (submitted) → used (final approval) → reversed (cancel after approval); pending → reversed (reject/cancel) or none (returned). Each transition applied exactly once.';

create table if not exists public.document_sequences (
  prefix      text not null check (prefix in ('HR', 'CERT')),
  year        int not null,
  last_value  int not null default 0 check (last_value >= 0),
  updated_at  timestamptz not null default now(),
  primary key (prefix, year)
);

-- ---------------------------------------------------------------------------------------------------
-- Certificates & templates
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.certificate_templates (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  certificate_type  text not null check (certificate_type in ('salary', 'employment', 'salary_employment', 'experience', 'custom')),
  variant           text not null default 'general',
  name_ar           text not null,
  name_en           text not null,
  language          text not null default 'bilingual' check (language in ('ar', 'en', 'bilingual')),
  content_ar        text,
  content_en        text,
  header_html       text,
  footer_html       text,
  show_logo         boolean not null default true,
  show_stamp        boolean not null default true,
  show_signature    boolean not null default true,
  show_qr           boolean not null default true,
  is_active         boolean not null default true,
  is_default        boolean not null default false,
  current_version   int not null default 1 check (current_version > 0),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  updated_by        uuid default auth.uid()
);

create table if not exists public.certificate_template_versions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.certificate_templates (id) on delete cascade,
  version       int not null check (version > 0),
  snapshot      jsonb not null,
  change_notes  text,
  changed_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  changed_at    timestamptz not null default now(),
  unique (template_id, version)
);

create table if not exists public.certificates (
  id                  uuid primary key default gen_random_uuid(),
  certificate_number  text not null unique,
  employee_id         uuid not null references public.employees (id) on delete cascade,
  request_id          uuid references public.hr_requests (id) on delete set null,
  template_id         uuid references public.certificate_templates (id) on delete set null,
  template_version    int,
  certificate_type    text not null check (certificate_type in ('salary', 'employment', 'salary_employment', 'experience', 'custom')),
  language            text not null check (language in ('ar', 'en', 'bilingual')),
  addressed_to        text,
  purpose             text,
  issue_date          date not null default current_date,
  status              text not null default 'valid' check (status in ('valid', 'revoked')),
  storage_path        text,
  issued_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  revoked_at          timestamptz,
  revoke_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  updated_by          uuid default auth.uid(),
  constraint certificates_storage_path_check
    check (storage_path is null or storage_path like 'certificates/' || employee_id::text || '/%')
);
comment on column public.certificates.storage_path is 'Bucket certificate-files, path certificates/{employee_id}/{certificate_number}.pdf.';

-- ---------------------------------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         text not null check (type in ('request_submitted', 'approval_required', 'request_approved',
                 'request_rejected', 'request_returned', 'request_assigned', 'request_in_progress', 'request_completed',
                 'request_cancelled', 'request_comment', 'registration_submitted', 'registration_approved',
                 'registration_rejected', 'registration_info_requested', 'certificate_issued', 'leave_balance_adjusted',
                 'expiry_alert', 'account_invited')),
  params       jsonb not null default '{}'::jsonb,
  link         text,
  entity_type  text,
  entity_id    uuid,
  read_at      timestamptz,
  emailed_at   timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid()
);
comment on table public.notifications is 'Text is rendered client-side from locales/*/notifications.json → types.<type>.title/body with params.';

create table if not exists public.notification_settings (
  id              uuid primary key default gen_random_uuid(),
  event_key       text not null unique,
  in_app_enabled  boolean not null default true,
  email_enabled   boolean not null default false,
  recipients      jsonb not null default '[]'::jsonb check (jsonb_typeof(recipients) = 'array'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid default auth.uid(),
  updated_by      uuid default auth.uid()
);

create table if not exists public.email_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text not null unique check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  name_ar       text not null,
  name_en       text not null,
  subject_ar    text not null,
  subject_en    text not null,
  body_ar       text not null,
  body_en       text not null,
  placeholders  jsonb not null default '[]'::jsonb check (jsonb_typeof(placeholders) = 'array'),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  updated_by    uuid default auth.uid()
);

create table if not exists public.email_logs (
  id                   uuid primary key default gen_random_uuid(),
  recipient            text not null,
  subject              text,
  template_key         text,
  related_entity_type  text,
  related_entity_id    uuid,
  status               text not null check (status in ('sent', 'failed', 'skipped')),
  provider             text,
  provider_message_id  text,
  error                text,
  sent_at              timestamptz,
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid()
);

-- ---------------------------------------------------------------------------------------------------
-- Data management & audit
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.import_rows (
  id          uuid primary key default gen_random_uuid(),
  import_id   uuid not null references public.imports (id) on delete cascade,
  row_number  int not null,
  raw         jsonb not null default '{}'::jsonb,
  mapped      jsonb not null default '{}'::jsonb,
  status      text not null default 'valid' check (status in ('valid', 'warning', 'error', 'imported', 'skipped')),
  errors      jsonb not null default '[]'::jsonb,
  warnings    jsonb not null default '[]'::jsonb,
  entity_id   uuid,
  created_at  timestamptz not null default now(),
  unique (import_id, row_number)
);

create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_email  text,
  action       text not null,
  entity_type  text,
  entity_id    text,
  employee_id  uuid,
  summary      text,
  changes      jsonb,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
comment on table public.audit_logs is 'Append-only. No UPDATE/DELETE for anyone (privileges revoked + guard trigger). Sensitive values masked as "***".';
comment on column public.audit_logs.employee_id is 'Employee the event relates to (employee rows, sub-records, requests) — powers the employee Activity tab.';

-- ---------------------------------------------------------------------------------------------------
-- Indexes (every FK + common filters)
-- ---------------------------------------------------------------------------------------------------
create index if not exists departments_parent_id_idx on public.departments (parent_id);
create index if not exists departments_head_employee_id_idx on public.departments (head_employee_id);

create index if not exists employees_department_id_idx on public.employees (department_id);
create index if not exists employees_job_title_id_idx on public.employees (job_title_id);
create index if not exists employees_manager_id_idx on public.employees (manager_id);
create index if not exists employees_location_id_idx on public.employees (location_id);
create index if not exists employees_cost_center_id_idx on public.employees (cost_center_id);
create index if not exists employees_import_id_idx on public.employees (import_id);
create index if not exists employees_employment_status_idx on public.employees (employment_status) where archived_at is null;
create index if not exists employees_iqama_expiry_idx on public.employees (iqama_expiry_date) where archived_at is null;
create index if not exists employees_passport_expiry_idx on public.employees (passport_expiry_date) where archived_at is null;
create index if not exists employees_contract_end_idx on public.employees (contract_end_date) where archived_at is null;
create index if not exists employees_company_email_idx on public.employees (lower(company_email));
create index if not exists employees_search_trgm_idx on public.employees using gin (search_text extensions.gin_trgm_ops);
create index if not exists employees_name_ar_trgm_idx on public.employees using gin (name_ar extensions.gin_trgm_ops);
create index if not exists employees_name_en_trgm_idx on public.employees using gin (name_en extensions.gin_trgm_ops);

create index if not exists profiles_matched_employee_id_idx on public.profiles (matched_employee_id);
create index if not exists profiles_reviewed_by_idx on public.profiles (reviewed_by);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_email_idx on public.profiles (lower(email));
create index if not exists profiles_search_trgm_idx on public.profiles
  using gin ((lower(coalesce(full_name, '') || ' ' || coalesce(email, ''))) extensions.gin_trgm_ops);

create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
create index if not exists role_permissions_module_action_idx on public.role_permissions (module, action);

create index if not exists employee_bank_accounts_employee_id_idx on public.employee_bank_accounts (employee_id);
create unique index if not exists employee_bank_accounts_one_primary on public.employee_bank_accounts (employee_id) where is_primary;
create index if not exists employee_dependents_employee_id_idx on public.employee_dependents (employee_id);
create index if not exists employee_insurance_employee_id_idx on public.employee_insurance (employee_id);
create index if not exists employee_insurance_dependent_id_idx on public.employee_insurance (dependent_id);
create index if not exists employee_insurance_expiry_idx on public.employee_insurance (expiry_date);
create index if not exists employee_documents_employee_id_idx on public.employee_documents (employee_id);
create index if not exists employee_documents_uploaded_by_idx on public.employee_documents (uploaded_by);
create index if not exists employee_documents_expiry_idx on public.employee_documents (expiry_date);

create index if not exists public_holidays_dates_idx on public.public_holidays (start_date, end_date);
create index if not exists leave_balances_leave_type_id_idx on public.leave_balances (leave_type_id);
create index if not exists leave_balances_year_idx on public.leave_balances (year);
create index if not exists leave_adjustments_leave_balance_id_idx on public.leave_adjustments (leave_balance_id);
create index if not exists leave_adjustments_changed_by_idx on public.leave_adjustments (changed_by);

create index if not exists request_types_workflow_id_idx on public.request_types (workflow_id);
create index if not exists request_fields_request_type_id_idx on public.request_fields (request_type_id, sort_order);
create index if not exists request_workflows_request_type_id_idx on public.request_workflows (request_type_id);
create index if not exists request_workflow_steps_approver_role_key_idx on public.request_workflow_steps (approver_role_key);
create index if not exists request_workflow_steps_approver_user_id_idx on public.request_workflow_steps (approver_user_id);

create index if not exists hr_requests_request_type_id_idx on public.hr_requests (request_type_id);
create index if not exists hr_requests_employee_id_idx on public.hr_requests (employee_id);
create index if not exists hr_requests_requester_id_idx on public.hr_requests (requester_id);
create index if not exists hr_requests_current_step_id_idx on public.hr_requests (current_step_id);
create index if not exists hr_requests_assigned_to_idx on public.hr_requests (assigned_to);
create index if not exists hr_requests_current_approver_id_idx on public.hr_requests (current_approver_id);
create index if not exists hr_requests_status_idx on public.hr_requests (status, created_at desc);
create index if not exists hr_requests_due_at_idx on public.hr_requests (due_at) where status in ('submitted', 'pending_manager_approval', 'pending_hr_review');
create index if not exists hr_requests_number_trgm_idx on public.hr_requests using gin (request_number extensions.gin_trgm_ops);
create index if not exists request_attachments_request_id_idx on public.request_attachments (request_id);
create index if not exists request_attachments_uploaded_by_idx on public.request_attachments (uploaded_by);
create index if not exists request_comments_request_id_idx on public.request_comments (request_id, created_at);
create index if not exists request_comments_author_id_idx on public.request_comments (author_id);
create index if not exists request_history_request_id_idx on public.request_history (request_id, created_at);
create index if not exists request_history_actor_id_idx on public.request_history (actor_id);
create index if not exists request_approvals_request_id_idx on public.request_approvals (request_id, created_at);
create index if not exists request_approvals_step_id_idx on public.request_approvals (step_id);
create index if not exists request_approvals_approver_id_idx on public.request_approvals (approver_id);
create index if not exists leave_requests_employee_id_idx on public.leave_requests (employee_id, start_date);
create index if not exists leave_requests_leave_type_id_idx on public.leave_requests (leave_type_id);
create index if not exists leave_requests_dates_idx on public.leave_requests (start_date, end_date);

create index if not exists certificate_template_versions_changed_by_idx on public.certificate_template_versions (changed_by);
create index if not exists certificates_employee_id_idx on public.certificates (employee_id);
create index if not exists certificates_request_id_idx on public.certificates (request_id);
create index if not exists certificates_template_id_idx on public.certificates (template_id);
create index if not exists certificates_issued_by_idx on public.certificates (issued_by);
create index if not exists certificates_number_trgm_idx on public.certificates using gin (certificate_number extensions.gin_trgm_ops);

create index if not exists notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_entity_idx on public.notifications (entity_type, entity_id);
create index if not exists email_logs_created_at_idx on public.email_logs (created_at desc);
create index if not exists email_logs_related_idx on public.email_logs (related_entity_type, related_entity_id);

create index if not exists import_rows_status_idx on public.import_rows (import_id, status);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_employee_id_idx on public.audit_logs (employee_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);

-- ---------------------------------------------------------------------------------------------------
-- created_by / updated_by / updated_at triggers
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'organization_settings', 'system_settings', 'roles', 'departments', 'job_titles', 'locations',
    'cost_centers', 'imports', 'employees', 'profiles', 'employee_compensation', 'employee_bank_accounts',
    'employee_dependents', 'employee_insurance', 'employee_documents', 'leave_types', 'public_holidays',
    'leave_balances', 'request_types', 'request_fields', 'request_workflows', 'request_workflow_steps', 'hr_requests',
    'certificate_templates', 'certificates', 'notification_settings', 'email_templates'
  ] loop
    execute format('drop trigger if exists set_audit_fields on public.%I', t);
    execute format(
      'create trigger set_audit_fields before insert or update on public.%I for each row execute function private.set_audit_fields()',
      t
    );
  end loop;

  foreach t in array array['hr_request_values', 'leave_requests', 'document_sequences'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Data normalisation triggers
-- ---------------------------------------------------------------------------------------------------
create or replace function private.normalize_bank_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.iban := nullif(upper(regexp_replace(coalesce(new.iban, ''), '\s', '', 'g')), '');
  return new;
end;
$$;

drop trigger if exists normalize_bank_account on public.employee_bank_accounts;
create trigger normalize_bank_account
  before insert or update of iban on public.employee_bank_accounts
  for each row execute function private.normalize_bank_account();

create or replace function private.employee_documents_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document_type = 'medical_report' then
    new.is_confidential := true;
  end if;
  -- the uploader is always the caller (service-role code may set it explicitly)
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  return new;
end;
$$;

drop trigger if exists employee_documents_defaults on public.employee_documents;
create trigger employee_documents_defaults
  before insert on public.employee_documents
  for each row execute function private.employee_documents_defaults();

create or replace function private.normalize_emails()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.company_email := nullif(lower(btrim(coalesce(new.company_email, ''))), '');
  new.personal_email := nullif(lower(btrim(coalesce(new.personal_email, ''))), '');
  return new;
end;
$$;

drop trigger if exists normalize_emails on public.employees;
create trigger normalize_emails
  before insert or update of company_email, personal_email on public.employees
  for each row execute function private.normalize_emails();

create or replace function private.validate_organization_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'hr:errors.validation' using detail = 'timezone';
  end if;
  if cardinality(new.working_days) = 0 then
    raise exception 'hr:errors.validation' using detail = 'working_days';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_organization_settings on public.organization_settings;
create trigger validate_organization_settings
  before insert or update of timezone, working_days on public.organization_settings
  for each row execute function private.validate_organization_settings();
