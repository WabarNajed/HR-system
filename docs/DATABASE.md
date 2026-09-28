# HR Portal — Database, Authorization & RPC Reference

The database is the security boundary. Every table in `public` has Row Level Security, sensitive
columns are protected with column privileges and guard triggers, and every multi-row mutation runs
through a `security definer` RPC that checks authorization explicitly. The UI hides things for comfort
only. This document describes what the migrations in `supabase/migrations/` build; `ARCHITECTURE.md`
§6–§7 is the contract, and this file gives the detail.

**Contents:**
1. Migrations and tooling
2. Data model overview
3. Roles, permissions and data scope
4. Authorization helpers
5. RLS matrix
6. Storage
7. RPC reference
8. Request workflow engine
9. Leave balance state machine
10. Dynamic request forms
11. Notifications and e-mail
12. Audit trail
13. Error keys
14. Default configuration seeds
15. Registration, invitations and Super Admin bootstrap
16. Applying the schema to hosted Supabase
17. Tests, generated types and local fixtures
18. Writing new migrations
19. Known limitations

---

## 1. Migrations and tooling

The migrations are the only source of the schema. Apply them in lexical order. Each file runs in one
transaction.

| File | Content |
|---|---|
| `20260927000100_foundation.sql` | `pg_trgm` and `unaccent` (in `extensions`), the `private` schema, and generic trigger helpers: `set_audit_fields`, `touch_updated_at`, `try_uuid`, `normalize_search` |
| `20260927000200_tables.sql` | All 43 tables, check constraints, indexes on every FK, trigram indexes, `created_by`/`updated_by` triggers, normalisation triggers (IBAN, e-mails, confidential medical reports, timezone validation) |
| `20260927000300_auth_helpers.sql` | Authorization helpers, the organization calendar (business days, SLA), notification and audit writers |
| `20260927000400_audit.sql` | Row-change audit triggers with masking, the append-only guard on `audit_logs`, and `log_audit_event` |
| `20260927000500_rls.sql` | RLS on every table, privilege tightening, all policies, guard triggers (profiles, employees, roles, request configuration, certificates, last super admin) |
| `20260927000600_request_engine.sql` | Numbering, leave-day counting, dynamic-form validation, the leave state machine, request effects, the workflow engine, and the request RPCs |
| `20260927000700_admin_rpcs.sql` | Registration review, users and roles, leave balances, notification e-mail claim, search, public RPCs, dashboard, expiry alerts, template versioning |
| `20260927000800_auth_hooks.sql` | `auth.users` insert hook (creates the profile) and e-mail sync |
| `20260927000900_storage.sql` | The four buckets and the `storage.objects` policies |
| `20260927001000`–`001300_seed_*.sql` | Default configuration as idempotent seed functions |
| `20260927001400_seed_apply_and_grants.sql` | Runs the seeds, adds `reset_organization`, and does the final EXECUTE-privilege sweep |
| `20260928005000_leave_config_admin.sql`, `…005100_leave_balances_direct_write_audit.sql` | M5 leave: org `leave.administer` may also write leave types and public holidays; direct API writes to `leave_balances` (insert, opening/entitlement changes) are audited |
| `20260928008000_request_config_rpcs.sql` | M8 request configuration RPCs (section 7, *Module RPCs*) |
| `20260928010000`–`010200_m1_*.sql` | M1 users & access: roles with members cannot be deleted; `registration_info_requested` e-mail; admin-invited users (`app_metadata.invited_by_admin`) become active; registration gate (GoTrue sign-ups are auto-rejected while self-registration is off); `approve_registration` needs `users.administer` to grant a role other than `employee` |
| `20260928011000`–`011200_dashboard_*.sql` | M11 read helpers (security invoker): dashboard breakdown / expiry items / compliance counts, `notification_counts`, `audit_log_facets` |
| `20260928012000_integration_rpc_fixes.sql` | `get_public_branding()` + `hr_email`; `claim_notification_emails()` also returns the template and sender settings; `global_search()` localized certificate subtitles + `type_key` column |
| `20260928020000`–`020100_settings_*.sql` | M2 settings: `description_ar/en` on the four master-data tables, in-use delete guard (`inUse`), department hierarchy guard, `master_data_usage`, `settings_overview` |
| `20260928030000`–`030100_employees_*.sql` | M3 employees: `employees.search_norm` (Arabic-folded), manager-cycle guard, directory helpers, atomic `save_employee`, identity-column guard on INSERT |
| `20260928040000_requests_viewer_access.sql` | M4 read-only request helpers (`get_my_request_access`, `get_request_capabilities`, `list_request_assignees`, `list_request_handlers`) |
| `20260928060000`–`060200_documents_*.sql` | M6 documents: review columns + `review_employee_document`; views `employee_document_list`, `expiry_items`, `employee_document_gaps`; `expiry_alert_runs` / `expiry_alert_log` + `run_expiry_alerts`; review needs `documents.approve`; medical reports always confidential; `cleanup_orphan_employee_documents` |
| `20260928070000`–`070200_certificates_*.sql` | M7 certificates: template drafts / publishing (`published_version`) and their RPCs; `issue_certificate` requires the stored PDF; direct INSERT / UPDATE / DELETE on `certificates` revoked (RPCs only) |
| `20260928090000`–`090200_reports_*.sql` | M9 report functions (security invoker — RLS decides the rows) |
| `20260928100000`–`100100_data_management*.sql` | M10: `import_sources` (parsed workbook grid of the import wizard); per-type access to imports, import rows and sources |
| `2026092821xxxx_<area>_fix_<desc>.sql`, `2026092822xxxx_<area>_fix_<desc>.sql` | Final QA-gate fixes (round 1 = `…21…`, round 2 = `…22…`), one file per fix; each header states *before / after*. Listed below |

**QA-gate fix migrations** (security-relevant ones in bold):

| File | Fix |
|---|---|
| **`20260928210101_auth_fix_account_emails.sql`** | `registration_confirm` e-mail template (seeded by `private.seed_auth_email_templates()`, called from `private.seed_defaults()`); admin-invited accounts are e-mail-confirmed (existing unconfirmed invited accounts confirmed) — section 15 |
| **`20260928210301_employees_fix_personal_column_scope.sql`** | Column scope for employee identity / personal data: column SELECT grants on `employees`, `private.employee_personal`, view `public.employee_records` (section 5) |
| `20260928210302_employees_fix_record_manager_rel.sql` | `employee_records`: to-one `manager` relationship for PostgREST embeds |
| `20260928210303_employees_fix_extra_data_merge.sql` | Direct Data API updates of `employees.extra_data` merge into the stored object |
| `20260928210401_requests_fix_inactive_type_visibility.sql` | A deactivated request type (and its fields) stays readable on the requests that use it |
| `20260928210402_requests_fix_center_counts.sql`, `…210403_…_viewer_once.sql` | `request_center_counts`: Request Center / Approvals counters in one RLS-scoped scan |
| **`20260928210501_leave_fix_self_service_sod.sql`** | Segregation of duties for HR writes on the actor's own record (super admin excepted): leave balance RPCs refuse it (`selfChangeNotAllowed`), and guard trigger `self_record_write_guard` blocks API changes to one's own `leave_balances`, `employee_compensation`, `employee_bank_accounts` |
| **`20260928210701_certificates_fix_immutable_files.sql`** | Issued (valid / revoked) certificate PDFs are immutable in Storage (section 6) |
| **`20260928210702_certificates_fix_verification_code.sql`** | Per-certificate `verification_code`; `verify_certificate(p_number, p_code)` reveals holder details only with the code (section 7, *Public*) |
| `20260928210801_requestconfig_fix_email_recipient_name_locale.sql` | `claim_notification_emails.recipient_name` in the e-mail's language (section 11) |
| `20260928210901_reports_fix_request_rows_perf.sql` | `report_request_rows()` performance at production volume |
| `20260928211101_dashboards_fix_today_and_facets.sql` | "Today" evaluated once per call (`expiry_buckets`, `employee_directory_stats`); index-friendly `audit_log_facets` |
| **`20260928211201_platformdb_fix_audit_rpc_lockdown.sql`** | `log_audit_event` / `log_email` service-role only; `record_login` for non-blocked users, one `auth.login` per session (section 12) |
| **`20260928211202_platformdb_fix_profile_visibility.sql`** | Full `profiles` rows: self + org viewers only; name cards through the view `profile_cards` (section 5) |
| **`20260928221201_platformdb_fix_audit_mask_verification_code.sql`** | `verification_code` added to the audit masking list; clear-text codes already in `audit_logs` redacted once (section 12) |
| **`20260928221202_platformdb_fix_document_file_immutable.sql`** | Files referenced by an `employee_documents` row cannot be overwritten, moved or deleted (only the uploader's own `pending_review` submission) — section 6 |
| `20260928221203_platformdb_fix_directory_stats_portal.sql` | `employee_directory_stats().without_portal` reads `profile_cards` (correct for managers) |

Commands:

```bash
pnpm db:types                  # regenerate src/types/database.ts (node scripts/gen-db-types.mjs; add --check in CI)
supabase/tests/run.sh          # database test suite (psql, rolled back, PASS/FAIL per check)
node scripts/dev/seed-local-fixtures.mjs --verify   # LOCAL ONLY QA users and data (see scripts/dev/README.md)
```

`DATABASE_URL` defaults to `postgresql://postgres:postgres@localhost:54322/postgres`, the same as `supabase start`.

## 2. Data model overview

The tables follow ARCHITECTURE §6. All PKs are `uuid` except `audit_logs.id`, which is a `bigint`
identity. Business tables carry `created_at`, `updated_at`, `created_by` and `updated_by`. The trigger
`private.set_audit_fields` maintains them, and an authenticated caller can never spoof them.
Enumerations are `text` with a `CHECK`. Bilingual text uses `*_ar`/`*_en`. Master-data names and
employee names need at least one language: CHECK `coalesce(name_ar, name_en) is not null`.

| Area | Tables |
|---|---|
| Organization | `organizations` (singleton), `organization_settings` (singleton), `system_settings` |
| Identity & access | `profiles`, `roles`, `user_roles`, `role_permissions` |
| Structure | `departments`, `job_titles`, `locations`, `cost_centers` |
| Employees | `employees`, `employee_compensation`, `employee_bank_accounts`, `employee_insurance`, `employee_dependents`, `employee_documents` |
| Leave | `leave_types`, `leave_balances`, `leave_adjustments`, `leave_requests`, `public_holidays` |
| Requests | `request_types`, `request_fields`, `request_workflows`, `request_workflow_steps`, `hr_requests`, `hr_request_values`, `request_attachments`, `request_comments`, `request_history`, `request_approvals`, `document_sequences` |
| Certificates | `certificate_templates`, `certificate_template_versions`, `certificates` |
| Communication | `notifications`, `notification_settings`, `email_templates`, `email_logs` |
| Documents compliance | `expiry_alert_runs`, `expiry_alert_log` (HR read-only; written by `run_expiry_alerts`) |
| Data & audit | `imports`, `import_rows`, `import_sources`, `audit_logs` |

Read models (views): `employee_document_list`, `expiry_items`, `employee_document_gaps` and
`employee_records` are **security invoker** (the caller's RLS applies). `profile_cards` is a
security-barrier definer view with its own row filter and SELECT-only grants (section 5).

Additions to the §6 column lists. All are additive, and the ARCHITECTURE file mentions each one:

- `roles.data_scope` (`own | team | organization`). See section 3.
- `profiles.matched_employee_id` (registration suggestion) and `profiles.review_note` (rejection reason or information request shown to the applicant).
- `employees.search_text`: a generated, lower-cased haystack of `employee_number`, both names and `company_email`, with a GIN trigram index. Use `.ilike('search_text', '%' + q.toLowerCase() + '%')`.
- `hr_requests.current_step_type`: the step type the request is waiting on. `request_number` is assigned on first **submission**, so drafts have `null`.
- `request_history.actor_name`, `request_comments.author_name` and `request_approvals.approver_name`: name snapshots. They exist because requesters cannot read other people's profiles. `request_approvals.step_type` is also added.
- `request_attachments.field_key`: which attachment field the file belongs to.
- `request_types.is_system`: the seeded types with built-in effects cannot be deleted, only deactivated.
- `email_templates.placeholders`: the variables the editor offers.
- `audit_logs.employee_id`: the employee an event concerns. It powers the employee Activity tab.
- `departments`, `job_titles`, `locations`, `cost_centers`: `description_ar`, `description_en`.
- `employees.search_norm`: generated, Arabic-folded (hamza / ya / ta-marbuta, no diacritics) search haystack with a trigram index.
- `employee_documents.review_note`, `reviewed_by`, `reviewed_at`: set only by `review_employee_document` (guard trigger).
- `certificate_templates.published_version`: the version used to issue; `current_version > published_version` means unpublished changes.
- `certificates.verification_code`: 12 random characters printed on the certificate; `verify_certificate` reveals holder details only with it.
- Path checks keep the database and storage in step:
  - `employee_documents.storage_path` must start with `{employee_id}/{id}/`.
  - `request_attachments.storage_path` must start with `requests/{request_id}/`.
  - `certificates.storage_path` must start with `certificates/{employee_id}/`.
  - `employees.avatar_path` must start with `{id}/avatar/`.

Useful facts:

- `leave_balances.remaining = opening_balance + entitlement + adjustment − used` is a generated column. `pending` is **not** subtracted, so availability for a new request is `remaining − pending`.
- `employee_compensation.total_salary` is generated.
- `employee_bank_accounts.iban` is normalised to upper case without spaces. The format is `^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$`, and one primary account per employee is enforced by a partial unique index.
- `employee_documents.is_confidential` is forced to `true` on insert for `medical_report`. `uploaded_by` is always the caller.
- `request_approvals` allows one `pending` row per request (partial unique index). This is the concurrency guard for the approval steps.
- Every FK column has an index. List columns (status, dates, expiry dates) have indexes too.

## 3. Roles, permissions and data scope

The permission matrix lives in `role_permissions (role_id, module, action)`:

- **Modules:** `employees, personal_data, bank, insurance, documents, requests, approvals, leave, certificates, reports, settings, audit, users`
- **Actions:** `view, create, edit, approve, export, administer`

A permission answers "may this role use this module or action". **Which rows** that applies to depends
on the role's `data_scope`:

| data_scope | Meaning | Seeded roles |
|---|---|---|
| `organization` | the role's permissions apply to every row (HR) | `super_admin` (rank 100), `hr_admin` (80), `hr_officer` (60) |
| `team` | own rows plus direct reports (structural, via `employees.manager_id`) | `manager` (40) |
| `own` | own rows only | `employee` (20) |

This is why the default `manager` role can hold `employees.view` without seeing every employee. The UI
should use `has_permission` semantics for navigation, and RLS decides the rows. New custom roles default
to `own`. Only a super admin can create an organization-scoped role or change the `data_scope` of a
system role.

Default matrix (seeded):

| Role | Permissions |
|---|---|
| super_admin | everything; also implicit in every helper |
| hr_admin | every module × action. Super-admin ownership is still protected by the RPCs |
| hr_officer | employees view/create/edit/export · personal_data view/edit · bank view · insurance view/edit · documents view/create/edit · requests view/edit/approve · approvals view/approve · leave view/create/edit/approve · certificates view/create · reports view/export |
| manager | employees view · requests view/approve · approvals view/approve · leave view/approve |
| employee | requests view/create · leave view/create · documents view · certificates view |

A person has as many roles as they need. A line manager is `manager` + `employee`, and an HR officer who
files their own requests is `hr_officer` + `employee`. `approve_registration` assigns `employee`, and HR
adds the rest with `set_user_roles`.

## 4. Authorization helpers (schema `private`)

All helpers are `security definer`, `stable` and `set search_path = ''`. Every helper returns
false/NULL when the caller's profile is not `active`.

| Helper | Returns |
|---|---|
| `current_profile_status()` | caller's `profiles.status` |
| `is_active_user()` | status = active |
| `has_role(key)`, `is_super_admin()` | role membership (active users only) |
| `is_hr()` | holds any role with `data_scope = 'organization'` (super_admin / hr_admin / hr_officer / custom HR roles) |
| `has_permission(module, action)` | permission through **any** role; super_admin ⇒ true (UI gating and RPC action checks) |
| `has_org_permission(module, action)` | permission through an **organization-scoped** role; super_admin ⇒ true (org-wide row access in RLS) |
| `current_employee_id()` | the caller's linked employee |
| `is_manager_of(employee_id)` | the employee's `manager_id` is the caller's employee (direct report) |
| `can_view_employee(employee_id)` | self ∨ manager_of ∨ `has_org_permission('employees','view')` |
| `can_view_request(request_id)` | request visibility for one request (RPCs and storage). The `hr_requests` policy implements the same rule set-based, and a test asserts they agree |
| `can_attach_to_request(request_id)` | requester while `draft`/`returned`, or HR with `requests.edit` |
| `my_direct_report_ids()`, `my_approval_request_ids()`, `manager_step_request_type_ids()`, `my_role_step_ids()` | sets used by policies as `col in (select …)` (evaluated once per statement) |
| `visible_profile_ids()` | profiles whose **name card** the caller may see (active HR / Super Admin staff, own manager, direct reports) — used by `profile_cards` only, never for full `profiles` rows |
| `org_timezone()`, `org_today()`, `is_business_day(date)`, `add_business_days(date, n)`, `sla_due_at(ts, n)` | organization calendar |

`authenticated` has EXECUTE only on these read-only helpers. The workflow engine, notification and
audit writers and the seeds are callable only from inside the security-definer RPCs. `private` must
never be added to the Data API's exposed schemas.

## 5. RLS matrix (as implemented)

`anon` has **no** table privileges and can execute only `verify_certificate` and
`get_public_branding`.

A user whose status is `pending`, `info_requested`, `rejected` or `disabled` sees only their own
`profiles` row.

| Table | Employee | Manager | HR (org-scoped perms) | Writes |
|---|---|---|---|---|
| employees | own row | + direct reports | `employees.view` | insert `employees.create`, update `employees.edit` (identity/personal columns also need `personal_data.edit`, via trigger), delete `employees.administer`. Readable **columns** are limited — see *Employee column scope* below |
| employee_compensation, employee_bank_accounts | own | ✗ | `bank.view` | `bank.create`/`bank.edit` |
| employee_insurance | own | ✗ | `insurance.view` | `insurance.*` |
| employee_dependents | own | ✗ | `personal_data.view` | `personal_data.*` |
| employee_documents | own, non-confidential or uploaded by self | ✗ | `documents.view` | HR `documents.create/edit`; owner may insert/delete own rows with `status = 'pending_review'`. The file a row references is immutable in Storage (section 6) |
| hr_requests | own (drafts: requester only) | current/previous approver; direct reports' requests whose type has a manager step; role-step queue | `requests.view` (not drafts) | RPCs only; HR `requests.edit` may update `priority`; requester may delete own draft |
| hr_request_values, request_history, request_approvals | follow hr_requests | follow hr_requests | follow hr_requests | RPC only |
| request_attachments | follow hr_requests | follow hr_requests | follow hr_requests | requester (draft/returned), HR `requests.edit` |
| request_comments | follow hr_requests, `is_internal = false` only | same, non-internal | all incl. internal (`requests.view`) | `add_request_comment` |
| leave_balances, leave_requests | own | direct reports | `leave.view` | balances: HR `leave.edit` on `opening_balance`/`entitlement` only (column grants); `used`/`pending`/`adjustment` only through RPCs |
| leave_adjustments | own | ✗ | `leave.view` | `adjust_leave_balance` |
| certificates | own, `valid` only | ✗ | `certificates.view` | RPCs only: `issue_certificate` (`certificates.create`), `revoke_certificate` (`certificates.edit`/`create`); no direct INSERT / UPDATE / DELETE |
| notifications | own | own | own | update `read_at`, delete own |
| profiles (full row) | self only | self only | all (`is_hr` or org `users.view`) | self: `full_name, mobile, preferred_language, theme` (+ `registration_*` while pending/info_requested); everything else only through RPCs |
| profile_cards (view: `id, full_name, employee_id, status`) | self + manager + direct reports + active HR / Super Admin staff | same | all | none (SELECT only) |
| user_roles | own | own | `users.view` | `set_user_roles` / `approve_registration` only |
| roles, role_permissions | read | read | read | `users.administer` (the super_admin role and system-role keys/scopes are protected) |
| organizations, organization_settings, system_settings | read | read | read | `settings.edit` |
| departments, job_titles, locations, cost_centers, leave_types, request_types, request_fields, request_workflows, certificate_templates | active rows | active rows | all rows with `settings.view` (+ `employees.view` / `leave.view` / `requests.view` / `certificates.view` as relevant) | `settings.edit` |
| public_holidays, request_workflow_steps | read | read | read | `settings.edit` |
| certificate_template_versions | ✗ | ✗ | `settings.view` / `certificates.view` | insert `settings.edit`, or `publish_certificate_template` |
| notification_settings, email_templates | ✗ | ✗ | `settings.view` | `settings.edit` |
| email_logs | ✗ | ✗ | `settings.view` / `audit.view` | `log_email` (service role only) |
| imports, import_rows, import_sources | ✗ | ✗ | `employees.create` or `settings.edit`, **and** the permission the import type writes (`employees.create`; master data / holidays `settings.edit`; balances `leave.edit`; dependents `personal_data.create/edit`) | same |
| expiry_alert_runs, expiry_alert_log | ✗ | ✗ | `documents.view` | `run_expiry_alerts` only |
| audit_logs | ✗ | ✗ | `audit.view` | append-only; triggers, definer RPCs and service-role `log_audit_event` only (section 12) |
| document_sequences | ✗ | ✗ | ✗ | `next_document_number` only |

**Employee column scope** (`20260928210301`). Rows of `public.employees` are decided by RLS, but
`authenticated` holds column-level SELECT only on the directory / employment / compliance columns
(`id, employee_number, name_ar, name_en, company_email, mobile, alt_mobile, gender, nationality,
department_id, division, section, job_title_id, grade, manager_id, employment_type, employment_status,
joining_date, probation_end_date, contract_start_date, contract_end_date, termination_date, location_id,
cost_center_id, id_type, iqama_expiry_date, iqama_expiry_hijri, passport_expiry_date, avatar_path,
import_id, archived_at, archived_by, search_text, created_at, updated_at, created_by, updated_by,
search_norm`).

- The identity / personal columns (`national_id`, `passport_number`, `date_of_birth`, `marital_status`,
  `address`, `personal_email`, `iqama_issue_date`, `iqama_profession`, `employer_number`,
  `is_outside_kingdom`, `emergency_contact_name/relationship/mobile`) are read only through the view
  **`public.employee_records`** (security invoker: same rows as `employees`, full row shape). It takes
  them from `private.employee_personal`, which returns a value only for the employee themselves or an
  org-scoped holder of `personal_data.view` / `personal_data.edit`, and NULL otherwise.
- `extra_data` (unmapped import columns) is returned only for org `personal_data.view` or
  `employees.create`. Direct API updates merge into the stored object (`employees_extra_data_merge`).
- A `select *` or an embed of a revoked column on `employees` fails with `permission denied`; code that
  needs those columns reads `employee_records`.
- **Adding an `employees` column:** a new non-sensitive column needs an explicit
  `grant select (<col>) on public.employees to authenticated;` in its migration, otherwise it is
  unreadable through the Data API. A sensitive column stays ungranted and is exposed only through
  `private.employee_personal` / `employee_records` (recreate both views with the new column).

Guard triggers add a second line of defence against direct Data API writes by `authenticated`. They
are security invoker: `current_user = 'authenticated'` marks a direct write, and statements inside
definer RPCs or from service-role code skip them.

- **profiles:** identity, status and link columns are immutable. Answering an information request moves `info_requested` back to `pending` and notifies the reviewers again.
- **employees:** identity-document and personal columns need `personal_data.edit`. `archived_by` is stamped.
- **roles:** system role keys are immutable, system roles cannot be deleted, and data scope changes are super-admin only.
- **role_permissions:** the super_admin role's rows are fixed.
- **request_types, request_fields:** system rows cannot be deleted, and system keys and types cannot change.
- **certificates:** the number and employee are immutable, `revoked` is final, and `revoked_at` is stamped.
- **Last super admin:** deleting the last active super admin's role, or deactivating that account, raises `hr:errors.lastSuperAdmin`. This applies to the service role too.

## 6. Storage

All buckets are private except `branding`. Private files are served through 60-second signed URLs
created with the **user's** client, so the SELECT policies below are the access check.

| Bucket | Path | Read | Write | Limit / types |
|---|---|---|---|---|
| `employee-documents` | `{employee_id}/{document_id}/{file}`; avatars `{employee_id}/avatar/{file}` | owner (non-confidential or own upload), HR `documents.view`; avatars: anyone who can view the employee | new objects: HR `documents.create/edit`; owner into a `pending_review` row they created; avatars: HR `employees.edit`. Overwrite (upsert), move and delete of a path an `employee_documents` row references: only the row's uploader, for their own record, while `pending_review` — nobody else (see below) | 20 MiB; pdf, jpeg, png, webp, heic, doc/x, xls/x |
| `request-attachments` | `requests/{request_id}/{uuid}-{file}` | whoever can view the request (requester, employee, current/previous approvers, HR) | requester (draft/returned), HR `requests.edit` | 20 MiB; as above + txt/csv |
| `certificate-files` | `certificates/{employee_id}/{certificate_number}.pdf`, `branding/stamp.*`, `branding/signature.*` | certificates: owner (only while `valid`), HR `certificates.view`; branding: `certificates.view` or `settings.view` | certificates: `certificates.create`, exactly `certificates/<employee uuid>/<file>`, and only while no `certificates` row references the path (issued PDFs — valid or revoked — are never overwritten, moved or deleted); branding: `settings.edit` | 20 MiB; pdf, png, jpeg, webp |
| `branding` (**public**) | `logo/*`, `login/*` | anyone | super_admin or `settings.administer` | 5 MiB; png, jpeg, webp, svg |

**Employee self-upload flow:**
1. Generate `docId`.
2. Insert the `employee_documents` row: `{id: docId, employee_id, document_type, status: 'pending_review', storage_path: `${employeeId}/${docId}/${file}`}`.
3. Upload to that path.

**HR flow:** the same steps with any status.

**Immutable document files** (`20260928221202`). INSERT creates a new object only (a plain insert on an
existing name is a duplicate error; an upsert takes the UPDATE path). UPDATE (upsert, move) and DELETE
go through `private.can_modify_employee_file(name)`: an object no `employee_documents` row references
(an avatar, a superseded file, an uncommitted replacement, an orphan) follows the write rule above; a
referenced object may be changed only by the row's uploader, for their own employee record, while the
row is `pending_review` (retry or withdrawal of a self-service submission). So:

- **Replace a file** (`prepareReplaceFile` / `commitReplaceFile`): upload to a new path in the document
  folder, point the row's `storage_path` at it (audited as `employee_document.update` and
  `document.replace_file`), then remove the old, now unreferenced object.
- **Delete a document** (HR): delete the row first, then the file. The owner's withdrawal of a
  `pending_review` upload removes the file first, then the row.
- Issued certificate PDFs follow the same rule (`20260928210701`): the pre-issue upload and the cleanup
  of an orphan after a failed issue are allowed; once `issue_certificate` references the path, the
  object is fixed.

**Request attachments:** upload to `requests/{requestId}/{uuid}-{file}`, then insert the
`request_attachments` row with `field_key`.

**Deleting a draft request:** the delete cascades to its `request_attachments` rows, but the files stay in
Storage. Remove them in the same server action.

**Organization reset:** the SQL cannot delete Storage objects, because Storage protects direct deletes.
The server action removes files through the Storage API with the service role.

## 7. RPC reference

Every RPC is `security definer` with `search_path = ''`. Every one checks the caller explicitly and is
atomic. Errors are `hr:errors.<key>` (section 13), and `DETAIL` carries a field key where relevant.
Forbidden errors use SQLSTATE `42501`, so PostgREST answers 403. Not-found errors use `P0002`, and the
others use `P0001`, which PostgREST answers with 400.

Arguments marked `= null` / `= …` have defaults. Everything else is required.

### Requests

| Function | Who | Returns | Errors |
|---|---|---|---|
| `create_request_draft(p_request_type_id uuid, p_values jsonb, p_subtype text = null, p_employee_id uuid = null)` | own request: `requests.create` (or `leave.create` for leave types); on behalf of someone else: org `requests.create` | draft id | forbidden, notFound, requestTypeInactive, employeeNotLinked, validation |
| `update_request_draft(p_request_id uuid, p_values jsonb, p_subtype text = null)` | requester, status draft/returned. `p_values` **replaces** the stored values | void | forbidden, notFound, requestNotEditable, validation |
| `submit_request(p_request_id uuid)` | requester. Assigns `HR-YYYY-000001`, sets `due_at`, and resumes returned requests at `returned_from_step_order` | `{status, notification_ids}` | forbidden, notFound, requestNotEditable, requestTypeInactive, requiredFieldMissing, validation, + leave errors |
| `act_on_request(p_request_id uuid, p_action text, p_comment text = null, p_target_user uuid = null)` | see section 8. Actions: `approve reject return reassign start complete cancel` | `{status, notification_ids}` | notFound (not visible), forbidden, invalidTransition, commentRequired (reject/return), returnNotAllowed, reassignNotAllowed, invalidAssignee, insufficientBalance |
| `add_request_comment(p_request_id uuid, p_body text, p_is_internal boolean)` | anyone who can view the request; internal comments need org `requests.view` | comment id | notFound, forbidden, validation |
| `get_request_workflow(p_request_id uuid)` | anyone who can view the request | rows `(step_order, step_type, name_ar, name_en, state, approver_id, approver_name, decided_at, comment)`; state ∈ `current, upcoming, approved, rejected, returned, skipped` | — (empty when not visible) |
| `count_leave_days(p_leave_type_id uuid, p_start date, p_end date)` | authenticated | numeric (0 when the range is invalid) | notFound, invalidDateRange (> 400 days) |
| `next_document_number(p_prefix text)` | `CERT`: org `certificates.create`; `HR`: org `requests.edit` | `CERT-YYYY-000001` | forbidden, validation |

### Leave

| Function | Who | Returns | Errors |
|---|---|---|---|
| `adjust_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year int, p_amount numeric, p_reason text)` | org `leave.edit`. Creates the balance if missing, records old/new remaining, notifies the employee | adjustment id | forbidden, validation, reasonRequired, notFound |
| `set_leave_balance(p_employee_id, p_leave_type_id, p_year, p_opening_balance numeric, p_entitlement numeric = null)` | org `leave.edit` (imports, balance editor) | balance id | forbidden, validation, notFound |
| `initialize_leave_balances(p_year int, p_employee_id uuid = null)` | org `leave.edit`. Creates missing balances for active deducting types with the default entitlement, honouring gender restrictions | rows created | forbidden, validation |

### Users and registration

| Function | Who | Returns | Errors |
|---|---|---|---|
| `approve_registration(p_profile_id uuid, p_employee_id uuid = null, p_role_key text = 'employee')` | org `users.approve` or `users.edit`. Allowed from pending/info_requested/rejected (or active without a link); assigning `super_admin` requires a super admin | void | forbidden, notFound, invalidTransition, roleNotFound, employeeAlreadyLinked |
| `reject_registration(p_profile_id uuid, p_reason text)` | same | void | forbidden, notFound, invalidTransition, reasonRequired |
| `request_registration_info(p_profile_id uuid, p_note text)` | same | void | same |
| `set_user_roles(p_user_id uuid, p_role_keys text[])` | org `users.administer`. Only a super admin may grant or revoke `super_admin` or change a super admin's roles; the last super admin is protected | void | forbidden, notFound, roleNotFound, lastSuperAdmin |
| `set_user_status(p_user_id uuid, p_status text, p_note text = null)` | org `users.edit`. `active` or `disabled`; not on yourself; super admins only by a super admin | void | forbidden, validation, notFound, lastSuperAdmin |
| `set_user_employee(p_user_id uuid, p_employee_id uuid)` | org `users.edit`; `null` unlinks | void | forbidden, notFound, employeeAlreadyLinked |
| `record_login()` | signed-in user whose profile is `pending`, `info_requested` or `active`, right after sign-in. Sets `last_login_at` and writes `auth.login` — **once per auth session** (JWT `session_id`, kept in `changes.session_id`); repeated calls in the same session are no-ops | void | unauthorized, forbidden (disabled / rejected) |
| `get_employee_manager(p_employee_id uuid)` | anyone who can view the employee | `{id, employee_number, name_ar, name_en, job_title_ar, job_title_en, company_email, avatar_path}` or null | — |

### Search, dashboard and administration

| Function | Who | Returns | Errors |
|---|---|---|---|
| `global_search(p_query text, p_locale text = 'ar', p_limit int = 20)` | **security invoker**, so RLS applies. Employees by name (Arabic hamza/ya/ta-marbuta folding), number or company e-mail; requests by number; certificates by number. National-ID matches only with `personal_data.view` | rows `(kind, id, title, subtitle, href)`; kind ∈ `employee, request, certificate` | — |
| `dashboard_stats()` | **security invoker**. The sections present depend on the caller: `employee`, `manager`, `hr`, `admin` (see below) | jsonb | — |
| `log_audit_event(p_action text, p_entity_type text = null, p_entity_id text = null, p_summary text = null, p_changes jsonb = null, p_actor_id uuid = null, p_ip text = null, p_user_agent text = null)` | **service role only** (EXECUTE revoked from `authenticated` / `anon`). Server code calls it through `src/lib/audit.ts` after its own permission check; `p_actor_id` is the verified session user (null = system event, must exist otherwise), `p_ip` / `p_user_agent` come from the end-user request. Action format `a.b[.c]` (≤ 100 chars); sensitive keys are masked; `entity_type = 'employee'` links the row to that employee's Activity tab | void | forbidden, validation (`action`, `actor`) |
| `claim_notification_emails(p_notification_ids uuid[])` | the actor who caused the notifications (`created_by`), or the service role. Marks them `emailed_at` and returns what is needed to render the e-mail (section 11) | rows | forbidden |
| `log_email(p_recipient, p_status, p_subject = null, p_template_key = null, p_related_entity_type = null, p_related_entity_id = null, p_provider = null, p_provider_message_id = null, p_error = null)` | **service role only** (`recordEmail` in `src/lib/email/send.ts`) | log id | forbidden, validation |
| `generate_expiry_alerts()` | service role (cron) or super admin | notifications created | forbidden |
| `publish_certificate_template(p_template_id uuid, p_change_notes text = null)` | org `settings.edit`. Snapshots a new version | new version | forbidden, notFound |
| `restore_certificate_template_version(p_template_id uuid, p_version int)` | org `settings.edit`. Restores, then publishes as a new version | void | forbidden, notFound |
| `reset_organization(p_confirmation text)` | super admin; phrase `RESET ORGANIZATION` (section 14) | void | forbidden, confirmationMismatch |

### Public

| Function | Who | Returns |
|---|---|---|
| `verify_certificate(p_number text, p_code text = null)` | **anon** and authenticated | at most one row `(certificate_number, employee_name, certificate_type, issue_date, status)`. `employee_name`, `certificate_type` and `issue_date` are filled only when `p_code` matches `certificates.verification_code` (normalized: case and separators ignored); the number alone confirms existence and status. The name follows the certificate language (`ar`, `en`, or `"ar / en"`). Nothing else is exposed |
| `get_public_branding()` | **anon** and authenticated | `{portal_name_ar/en, company_name_ar/en, logo_bucket: 'branding', logo_path, login_image_path, primary_color, secondary_color, login_title_ar/en, login_subtitle_ar/en, default_language, allow_self_registration, setup_completed}`. Public logo URL: `${SUPABASE_URL}/storage/v1/object/public/branding/${logo_path}` |

### Module RPCs

Added by the module migrations (section 1). **Definer** functions check the caller explicitly
(`forbidden` otherwise); **invoker** functions add no access — RLS decides what they see or count.

| Function | Kind · who | Returns |
|---|---|---|
| `save_request_type(p_id uuid, p_values jsonb)`, `duplicate_request_type(p_source_id uuid, p_key text, p_name_ar text, p_name_en text)`, `save_request_fields(p_request_type_id uuid, p_fields jsonb)`, `save_request_workflow(p_request_type_id uuid, p_steps jsonb)` | definer · active, org `settings.edit`. Atomic builder saves; the workflow and the `requires_*_approval` flags stay in step | uuid / jsonb |
| `request_type_usage()`, `request_field_usage(p_request_type_id uuid)` | definer · active, org `settings.view` | aggregate rows |
| `email_log_links(p_notification_ids uuid[])` | definer · active, org `settings.view` or `audit.view` | `(notification_id, type, link, entity_type, entity_id)` |
| `master_data_usage(p_entity text)` | definer · org `settings.view` or `employees.view` | per-row employee / sub-department counts |
| `settings_overview()` | definer · active; each section only with its permission | jsonb |
| `employee_directory_stats(p_manager_id uuid = null)`, `employee_filter_options()`, `employee_manager_candidates(p_employee_id uuid, p_query text, p_limit int)` | invoker | jsonb / rows |
| `save_employee(p_employee_id uuid, p_employee jsonb, p_compensation jsonb, p_bank jsonb)` | invoker (every write goes through the table policies and guards) · creates / updates an employee with compensation and primary bank account in one transaction | uuid |
| `get_my_request_access()`, `get_request_capabilities(p_request_id uuid)` | definer · active; flags computed with the same private predicates as the request RPCs | jsonb |
| `list_request_assignees(p_request_id uuid, p_query text, p_limit int)`, `list_request_handlers()` | definer · callers who may reassign / org `requests.view` | people rows |
| `request_center_counts(p_now timestamptz, p_month_start timestamptz)` | invoker · all Request Center / Approvals counters in one scan | jsonb |
| `review_employee_document(p_document_id uuid, p_decision text, p_note text)` | definer · org `documents.approve` (or super admin) | new status |
| `run_expiry_alerts(p_source text)` | definer · service role (cron), super admin or org `documents.edit` | jsonb summary |
| `cleanup_orphan_employee_documents(p_min_age interval)` | definer · service role (cron) or super admin | rows removed |
| `create_certificate_template(p_data jsonb, p_change_notes text)`, `save_certificate_template(p_template_id uuid, p_data jsonb, p_change_notes text, p_expected_version int)`, `publish_certificate_template_draft(p_template_id uuid)`, `restore_certificate_template_draft(p_template_id uuid, p_version int, p_change_notes text)`, `set_certificate_template_active(p_template_id uuid, p_active boolean)`, `set_default_certificate_template(p_template_id uuid)` | definer · org `settings.edit` | uuid / version / void |
| `issue_certificate(p_certificate_number text, p_request_id uuid, p_employee_id uuid, p_template_id uuid, p_template_version int, p_language text, p_addressed_to text, p_purpose text, p_verification_code text)` | definer · org `certificates.create`; the PDF must already exist in Storage | uuid |
| `revoke_certificate(p_certificate_id uuid, p_reason text)` | definer · org `certificates.edit` or `certificates.create` | void |
| `dashboard_employee_breakdown()`, `dashboard_compliance_counts()`, `dashboard_expiry_items(p_days int, p_limit int, p_employee_id uuid)`, `notification_counts()`, `audit_log_facets(p_since timestamptz)` | invoker | jsonb / rows |
| `report_*_rows(p_filters jsonb)`, `report_summary(p_report text, p_filters jsonb)`, `report_catalog_stats()`, `report_headcount_trend(p_filters jsonb)`, `report_employee_breakdown(p_dimension text, p_filters jsonb)`, `report_sla_rows(p_filters jsonb)`, `report_audit_events(p_filters jsonb)` | invoker · filters re-validated in SQL (uuid / date parsing, whitelisted enums) | rows / jsonb |

`dashboard_stats()` sections:

- **`employee`:** `open_requests, returned_requests, draft_requests, certificates, documents_expiring, upcoming_leave, unread_notifications, leave_balances[] {leave_type_id, code, name_ar, name_en, color, remaining, pending, used, available}`.
- **`manager`**, when the caller has direct reports: `direct_reports, pending_approvals, team_on_leave_today, team_upcoming_leave, team_open_requests`.
- **`hr`**, with org `employees.view` or `requests.view`:
  - `total_employees, employees_by_status, new_joiners_30d`
  - `pending_requests, pending_hr_review, pending_my_action, in_progress_requests, overdue_requests, due_soon_requests`
  - `on_leave_today, upcoming_leave_7d, certificates_issued_30d, pending_registrations`
  - `expiring.{iqama, passport, contract, insurance, documents}.{expired, within7, within14, within30, within60, within90}`. The buckets are **exclusive**: 0–7, 8–14, 15–30, 31–60 and 61–90 days.
- **`admin`**, for a super admin or `users.view`: `users_total, users_by_status, roles, setup_completed, active_request_types, active_leave_types, departments, imports_last_30d, audit_events_24h`.

Every result also carries `generated_at` and `today` (the organization's date). Inactive users get
`{"scope": "none"}`.

## 8. Request workflow engine

**Statuses:** `draft → submitted → pending_manager_approval | pending_hr_review → approved → in_progress → completed`,
plus `returned`, `rejected` and `cancelled`. `submitted` is transient: `submit_request` moves the
request straight to the first actionable step.

**Step resolution** (`private.resolve_steps`) uses the active workflow of `request_types.workflow_id`,
otherwise the latest active `request_workflows` row of the type. If neither exists, it synthesizes a
manager step (if `requires_manager_approval`) followed by an HR step (if `requires_hr_approval`, or if
nothing else is configured).

| Step type | Approver | Status while waiting | Skipped when (history `skip` + approval `skipped`) |
|---|---|---|---|
| `manager` | active profile linked to `employees.manager_id` (`current_approver_id`) | pending_manager_approval | no manager / manager has no active account / manager is the requester |
| `user` | `approver_user_id` | pending_hr_review if that user is HR, else pending_manager_approval | inactive, or is the requester/employee |
| `role` | any active holder of `approver_role_key` (queue) | pending_hr_review for org-scoped roles, else pending_manager_approval | nobody holds the role |
| `hr` | HR queue: org `requests.approve` or `approvals.approve`. Optional `assigned_to` | pending_hr_review | never |

**Actions** (`act_on_request`):

| Action | Allowed when / by | Effect | Notification |
|---|---|---|---|
| approve | pending step; the step's approver (see above). **Nobody approves their own request** (super admin excepted) | approval row `approved`, next step entered, or final approval → `approved` + effects | next approvers `approval_required`; on final approval requester + employee `request_approved` |
| reject | same, comment required | `rejected`; leave hold released | `request_rejected` |
| return | same, comment required, `can_return` | `returned`, `returned_from_step_order` = current step; leave hold released (effect → `none`) | `request_returned` |
| reassign | pending: the current approver or HR `requests.edit`, `can_reassign`, target active and not the requester (HR step: target must hold org `requests.approve`); approved/in_progress: HR `requests.edit` sets `assigned_to` | `reassigned` + new `pending` approval | target `request_assigned` |
| start | `approved`; HR `requests.edit`/`approve` | `in_progress`, `assigned_to` defaults to the actor | `request_in_progress` |
| complete | `approved`/`in_progress`; HR | `completed`, `completed_at` | `request_completed` |
| cancel | requester/employee while draft/submitted/pending/returned; HR `requests.edit` for any non-final status (incl. approved/in_progress) | `cancelled`, `cancelled_at`; leave pending/used reversed | owner cancel → current approver/assignee; HR cancel → requester + employee (`request_cancelled`) |

**Other rules:**

- **Final states:** `rejected`, `completed` and `cancelled`. Acting on a request that is no longer at
  the expected step raises `invalidTransition` (or `forbidden` if the caller is no longer the
  approver). The request row is locked (`FOR UPDATE`), so a double click or concurrent approvers cannot
  apply an effect twice.
- **Resubmitting a returned request** re-validates it and resumes at `returned_from_step_order`. The
  request keeps its number, and approvers of earlier steps are not asked again.
- **SLA:** `due_at = private.sla_due_at(submit time, request_types.sla_business_days)`. That is the end
  of the working day (`organization_settings.work_end`, organization timezone) N business days later.
  Business days are `working_days` minus `weekend_days` minus active `public_holidays`. It is
  recomputed on resubmission. The UI derives On track / Due soon / Overdue from `due_at`.
- **History actions** (`request_history.action`): `create, update` (returned requests only),
  `submit, resubmit, approve, reject, return, reassign, start, complete, cancel, comment, skip`.
  `metadata` carries step info and `effects`.
- **Audit actions:** `request.create|update|submit|resubmit|approve|reject|return|reassign|start|complete|cancel`.

**Effects on final approval:**

| Type key | Effect |
|---|---|
| `leave` (or any type with a `leave_type` system field) | leave state machine `pending → used` (section 9) |
| `bank_update` | upsert the primary `employee_bank_accounts` row from `bank_name`, `iban`, `account_holder`. History keeps the old/new values with the IBAN masked (`****1234`) |
| `employee_info_update` | by subtype: `mobile → employees.mobile`, `email → personal_email`, `address`, `marital_status` (`requested_marital_status`), `emergency_contact` (3 fields), `passport` (`passport_number`, `passport_expiry`); `dependent`/`other` have no automatic effect. Old/new values go into the history metadata, with the passport number masked |
| others | none; HR completes them. For certificates, HR generates the certificate, then completes |

## 9. Leave balance state machine

`leave_requests.balance_effect` changes only through these transitions, each applied once, with the
row locked:

```
none ──submit (deducting type)──▶ pending ──final approval──▶ used ──cancel (HR)──▶ reversed
                                     │
                                     ├──reject / cancel──▶ reversed
                                     └──return──────────▶ none   (hold released; resubmit re-validates and holds again)
```

| Event | Balance change |
|---|---|
| submit | `pending += days`. The balance row for the start year is created with `default_entitlement` if missing |
| final approval | `pending −= days`, `used += days`. Requires `remaining ≥ days` at that moment |
| reject / cancel before approval | `pending −= days` |
| cancel after approval | `used −= days` |

Validation happens at submit, in this order:

1. Active leave type.
2. `end ≥ start`.
3. Gender restriction: an employee with a null gender is also rejected.
4. `count_leave_days > 0`.
5. `max_days_per_request`.
6. `requires_attachment`.
7. No overlap with another non-draft, non-rejected, non-cancelled leave.
8. For deducting types, `remaining − pending ≥ days`.

`return_date` defaults to the next business day. The computed `days` is stored in the leave row and in
`hr_request_values.days`. Non-deducting types (sick, marriage, …) never touch balances.

`count_leave_days` counts every day on a `calendar` basis. On a `working` basis it skips weekend days,
non-working days and active public holidays.

## 10. Dynamic request forms

`request_fields` rows drive the form. The UI must follow these rules exactly, because the RPCs apply
the same ones.

**Stored value format per `field_type`:**

| Field type | Stored value |
|---|---|
| short_text, long_text, phone | string |
| email | lower-cased string |
| number, currency | number |
| date | `YYYY-MM-DD` |
| datetime | ISO timestamp |
| time | `HH:MM` |
| yes_no | boolean |
| dropdown | option `value` |
| multi_select | array of option values |
| leave_type, dependent, employee | uuid string |
| attachment | free (attachment ids); the files are `request_attachments` rows with `field_key` |

**Other rules:**

- Empty values (`null`, `""`, `[]`) are not stored. Unknown keys raise `validation`.
- `validation` jsonb supports `pattern` (regex, text), `min`/`max` (numbers), and UI hints `readonly`,
  `computed: "leave_days"`, `granularity: "month"`, `step`.
- **Subtype:** a system `subtype` dropdown field, when present, drives `hr_requests.subtype`. Pass it as
  `p_subtype`, not inside `p_values`.
- **Visibility** (`visibility` jsonb): `null` means always visible.
  - `{"field": "<key>|subtype", "in": [...]}`
  - `{"field": ..., "not_in": [...]}`
  - `{"all": [rule, ...]}`
  - `{"any": [rule, ...]}`

  Values match by JSON equality or by text form, and array values match on any element.
- **Required fields are enforced only when visible.** A required attachment field is satisfied by a
  value or by an attachment row with that `field_key` (or no `field_key`).
- Seeded examples:
  - `business_trip.advance_amount` is visible when `advance_required` is `true`.
  - `medical_insurance.dependent` uses an `any` rule.
- Categories used by the seeded types, for the UI labels: `time_off, documents, government, benefits,
  payroll, attendance, personal_data, travel, separation, general`.

## 11. Notifications and e-mail

`notifications` rows are created only by RPCs and triggers, never by clients. The text is rendered
client-side from `locales/*/notifications.json` (`types.<type>.title/body`) with `params`.

- **Request events** have these `params`: `request_id, request_number, request_type_key, request_type_name_ar, request_type_name_en, status, actor_name, employee_name_ar, employee_name_en, employee_number`. Some events add `comment`, `step_name_ar/en` or `is_internal`.
- **Registration events:** `full_name, email, employee_number, matched | resubmitted | reason | note`.
- **`certificate_issued`:** `certificate_number, certificate_type, employee_name_ar/en, actor_name`.
- **`leave_balance_adjusted`:** `leave_type_name_ar/en, amount, year, old_remaining, new_remaining, actor_name`.
- **`expiry_alert`:** `kind (iqama|passport|contract|insurance|document), expiry_date, days_left, document_type, employee_id, employee_name_ar/en, employee_number`.
- `link` is an app route such as `/requests/{id}`, `/settings/pending-registrations`, `/leave`,
  `/certificates` or `/employees/{id}`.
- `request_submitted` is also sent to the requester as a confirmation.
- Nobody else is notified about their own actions.

`notification_settings.event_key` equals the notification type:

- `in_app_enabled = false` with e-mail on stores the row already read.
- Both flags off suppresses the event.

**E-mail delivery** (`lib/notifications.ts`, no service role needed):
1. Take `notification_ids` from the RPC result.
2. Call `claim_notification_emails(ids)`. It returns `recipient_email, recipient_name, language, type, params, link, template_key` for types whose `email_enabled` is on, and marks them `emailed_at` (idempotent). `recipient_name` is the linked employee's name in the e-mail language (`name_ar` / `name_en` with cross-fallback), else `profiles.full_name`, else the e-mail address.
3. Render `email_templates[template_key]` in `language` and send it.
4. Call `log_email(...)` through the **service-role** client (`recordEmail`); users cannot write `email_logs`.

Template mapping: `account_invited → account_invitation`, `expiry_alert → {kind}_expiry`, and
otherwise the same key as the type.

Registration e-mails come from a trigger with no actor, so the server claims them with the service
role.

## 12. Audit trail

**Row triggers** write `'<entity>.create|update|delete|archive|restore'` for these tables:

- employees and the five sub-record tables
- user_roles, roles, role_permissions, and profile status/link changes
- organizations, organization_settings, system_settings
- departments, job_titles, locations, cost_centers
- leave_types, public_holidays, leave_adjustments
- request_types, request_fields, request_workflows, request_workflow_steps
- certificate_templates, certificates, email_templates, notification_settings

`archive` and `restore` are recorded when `archived_at` flips. Each row records:

- `changes`: `{field: {old, new}}` for the fields that changed.
- `summary`: a readable label.
- `employee_id`: the related employee.
- `actor_id` and `actor_email`.
- `ip` and `user_agent`: for app events, the end-user request's `x-forwarded-for` / `user-agent`
  (passed by `src/lib/audit.ts`); for triggers and RPCs, the PostgREST request headers (the Next.js
  server when the call comes from server code).

**Masking** (`private.mask_changes`, used by every writer): `iban`, `basic_salary`,
`housing_allowance`, `transport_allowance`, `other_allowance`, `total_salary`, `salary`, `amount_salary`,
`national_id`, `passport_number` and the certificate `verification_code` are stored as `"***"` (each
non-null `old` / `new`), but the field is still named. `log_audit_event` masks the same keys. Codes
written before `20260928221201` were redacted once by that migration.

**RPC events:** `request.*`, `registration.submit|approve|reject|request_info`, `user.invite`,
`user.roles_update`, `user.enable|disable`, `auth.login`, `leave_balance.initialize|update`,
`organization.reset`.

**App events** (no row change) are written by server code with `logAuditEvent()` (`src/lib/audit.ts`)
**after** the action's own permission check: the service-role client calls `log_audit_event` with the
verified session user (`auth.getClaims().sub`) as `p_actor_id`. A user JWT cannot call the RPC, so the
trail cannot be forged or flooded from the Data API. Events: `auth.logout`, `auth.password_changed`,
`export.<dataset>`, `backup.*`, `employee.import`, `import.<type>`, `employee.iban_reveal`,
`document.*` (upload, replace_file, approve, reject, withdraw, delete, expiry_check), `certificate.revoke`,
`email.test`, `email_template.test`, `role.permissions_update`, `user.invitation_sent`,
`user.password_reset_sent`, `user.bootstrap_super_admin` (CLI, no actor).

`auth.login` is written by `record_login()` (section 7): once per auth session, never for disabled or
rejected accounts.

**Append-only:** UPDATE, DELETE and TRUNCATE are revoked from `authenticated`, `service_role` and the
owner. A trigger also rejects UPDATE, DELETE and TRUNCATE even if privileges are re-granted. Only a
migration can lift both (the one-time `verification_code` redaction in `20260928221201` does so for one
key-scoped UPDATE and restores them in the same transaction). Seeds and
`reset_organization` run with `hr.suppress_audit` so bulk system work does not flood the log. The reset
itself is audited.

## 13. Error keys

The RPCs and triggers raise `hr:errors.<key>`. The app strips the `hr:` prefix and translates the
remaining `errors.<key>`.

| Key | When |
|---|---|
| forbidden | missing permission, not the approver, self-approval, protected super-admin actions |
| unauthorized | no signed-in user (`record_login`) |
| notFound | record missing or not visible to the caller |
| validation | bad value or format, unknown field, bad subtype or option, bad action (DETAIL = field key) |
| requiredFieldMissing | required visible field empty at submit (DETAIL = field key) |
| requestNotEditable | edit or submit of a request that is not draft/returned |
| requestTypeInactive | creating or submitting with a deactivated type |
| invalidTransition | action not allowed in the current status (incl. acting twice) |
| commentRequired | reject/return without a comment |
| returnNotAllowed / reassignNotAllowed | step has `can_return` / `can_reassign` = false |
| invalidAssignee | reassign target missing, inactive, requester, or lacking HR permission |
| insufficientBalance | leave exceeds available balance (DETAIL = `{"available", "requested"}`) |
| overlappingLeave | leave overlaps another active leave request |
| invalidDateRange | end before start, no working days, return before end, range > 400 days |
| leaveMaxDaysExceeded | more than `max_days_per_request` (DETAIL = max) |
| leaveGenderRestricted | leave type restricted to the other gender |
| attachmentRequired | leave type requires an attachment |
| employeeNotLinked | caller has no linked employee |
| employeeAlreadyLinked | employee already linked to another account |
| roleNotFound | unknown role key |
| reasonRequired | rejection, information request or leave adjustment without a reason |
| lastSuperAdmin | would remove or disable the last active super admin |
| systemRecord | deleting or renaming a system role, request type or field |
| confirmationMismatch | wrong organization-reset phrase |

Constraint violations surface as SQLSTATE codes, and `lib/errors.ts` maps them:

- `23505` unique violation → `errors.duplicate`
- `23503` FK violation, e.g. deleting master data in use → `errors.inUse`
- `23514` check violation → `errors.validation`
- `42501` / RLS violation → `errors.forbidden`

## 14. Default configuration seeds

The seeds are real product defaults, all editable at runtime. They are idempotent functions: re-running
never overwrites an admin's edits.

- **Organization:** empty company names (the setup wizard fills them); settings SAR, `Asia/Riyadh`,
  `ar`, Sun–Thu working days, Fri/Sat weekend, 08:00–17:00, portal names `بوابة الموارد البشرية` /
  `HR Portal`, colours `#0F5E6B` / `#B8862F`, expiry alerts 90/60/30/14/7 days, self-registration on,
  `setup_completed_at` null.
- **Roles and permissions:** as in section 3.
- **Leave types** (aligned with the Saudi Labor Law):

  | Code | Paid | Deducts | Entitlement | Max per request | Basis | Attachment | Gender |
  |---|---|---|---|---|---|---|---|
  | annual | ✓ | ✓ | 21 | – | working | – | – |
  | sick | ✓ | – | – | – | calendar | ✓ | – |
  | emergency | ✓ | ✓ | 5 | 3 | working | – | – |
  | unpaid | – | – | – | – | calendar | – | – |
  | marriage | ✓ | – | – | 5 | calendar | ✓ | – |
  | maternity | ✓ | – | – | 84 | calendar | ✓ | female |
  | paternity | ✓ | – | – | 3 | calendar | ✓ | male |
  | bereavement | ✓ | – | – | 5 | calendar | – | – |
  | hajj | ✓ | – | – | 15 | calendar | – | – |
  | exam | ✓ | – | – | – | calendar | ✓ | – |
  | other | – | – | – | – | calendar | – | – |

- **Request types** (key · category · SLA business days · workflow · field count):

  | Key | Category | SLA | Workflow | Fields |
  |---|---|---|---|---|
  | leave | time_off | 2 | manager→hr | 8 |
  | certificate | documents | 3 | hr | 7 |
  | iqama_visa | government | 5 | hr | 11 |
  | medical_insurance | benefits | 3 | hr | 10 |
  | payroll | payroll | 5 | hr | 5 |
  | attendance | attendance | 2 | manager→hr | 7 |
  | bank_update | personal_data | 3 | hr | 5 |
  | employee_info_update | personal_data | 3 | hr | 11 |
  | overtime | attendance | 3 | manager→hr | 6 |
  | business_trip | travel | 3 | manager→hr | 12 |
  | resignation | separation | 5 | manager→hr | 5 |
  | other | general | 5 | hr | 3 |

  That is 90 fields in total, with bilingual labels, help, placeholders and options. Icons are kebab-case
  lucide names from `ICON_REGISTRY`.
- **Certificate templates** (bilingual formal wording, version 1 published):
  - `salary_general` (default for salary), `salary_bank`, `salary_embassy`
  - `employment`, `salary_employment`, `experience`, `custom_letter`

  The renderer must honour `data-if="include_salary|include_allowances|addressed_to"` and
  `data-if-not="addressed_to"`: drop the element when the flag is false or empty, or true, respectively.
  `header_html` and `footer_html` use the company name and address variables.
- **E-mail templates:** the 16 keys from §6 with formal Arabic and English subjects and bodies.
  `{{recipient_name}}` is added to the common placeholders.
- **Notification settings:** one row per notification type. E-mail is on for submitted, approval
  required, approved, rejected, returned, completed, registration submitted/approved/rejected, expiry
  alert and account invited.
- **No departments, job titles or employees are seeded:** they are specific to each organization.

**`reset_organization`** deletes the following, then re-runs the configuration seeds:

- all business data: employees and sub-records, requests, leave, documents metadata, certificates,
  notifications, e-mail logs, imports
- master data, holidays and every configuration table
- every non-super-admin auth account

It keeps the super-admin accounts, roles, role permissions and the audit trail.

## 15. Registration, invitations and Super Admin bootstrap

- **Self sign-up** (`supabase.auth.signUp` with `options.data = {full_name, mobile, employee_number}`):
  1. The `on_auth_user_created` trigger creates `profiles` with `status = 'pending'` and copies those
     values into `full_name`, `mobile` and `registration_employee_number`. They are **untrusted**
     input: `user_metadata` can never set the status or roles.
  2. It suggests `matched_employee_id` when the input uniquely matches an unlinked employee's
     `employee_number` (case-insensitive) or `national_id`.
  3. Reviewers holding org `users.approve` are notified (`registration_submitted`).
  4. HR then calls `approve_registration`, `reject_registration` or `request_registration_info`. When an
     applicant answers an information request by updating their registration fields, the profile goes
     back to `pending` and the reviewers are notified again.
- **Admin-provisioned users** (invite or create from Users). Server code, after `requirePermission('users', 'create')`:
  1. Creates the Auth user with the **service role**. Use
     `auth.admin.createUser({ email, email_confirm: true, app_metadata: { invited_by_admin: true }, user_metadata: { full_name } })`
     and then `auth.admin.generateLink({ type: 'recovery' })` for the activation link (never
     `inviteUserByEmail`, which leaves the account unconfirmed — see *Account e-mails* below).
     `app_metadata` can only be set with the service role. When `invited_by_admin` is present at
     insert, the trigger creates the profile as `active` with `invited_at`. Otherwise it is `pending`.
  2. Links the employee and assigns roles with the **user's** client, so the actor is audited:
     `approve_registration(profile_id, employee_id, role)`, which also works for an active profile
     that is not linked yet, then `set_user_roles`.
  3. Inserts an `account_invited` notification or e-mail through the service role.
- **Account e-mails** (`src/lib/auth/provisioning.ts`, `scripts/bootstrap-super-admin.ts`). When the
  server has `SUPABASE_SERVICE_ROLE_KEY`, an e-mail provider (`RESEND_API_KEY` or `SMTP_HOST`) and
  `EMAIL_FROM`, the portal generates the link with `auth.admin.generateLink` and sends its own bilingual
  template (Arabic-first, recipient's language), logged in `email_logs`:
  - self sign-up → `registration_confirm` (`generateLink({ type: 'signup' })`);
  - forgot password → `password_reset` (`recovery`), or `account_invitation` for an invited account
    that never activated;
  - admin invitation / resend and the Super Admin bootstrap → `account_invitation`.

  Links point at `/auth/confirm?token_hash=…&type=…` with `next=/reset-password` (`next=/pending-approval`
  for sign-up). Without that configuration the flows fall back to GoTrue's own e-mails and templates.
  **Invited accounts are created with a confirmed e-mail** (`email_confirm: true`), because with e-mail
  confirmations off an unconfirmed invited address could be claimed through the public sign-up. Their
  activation link is therefore a `recovery` link (the reset page shows "Set your password");
  `20260928210101` confirmed the invited accounts that already existed. `password_reset` and
  `account_invitation` come from `private.seed_email_templates()`; `registration_confirm` from
  `private.seed_auth_email_templates()`. `private.seed_defaults()` calls both — **any redefinition of
  `private.seed_defaults()` must keep `perform private.seed_auth_email_templates();`**, or
  `reset_organization` loses the sign-up template.
- **Super Admin bootstrap** (`pnpm bootstrap:super-admin --email <addr>`, service role):
  1. Find or create the Auth user by e-mail, with `app_metadata.invited_by_admin = true`.
  2. Upsert the `profiles` row with `status = 'active'`. The trigger created it, and a pre-existing
     user is promoted.
  3. Insert `user_roles (user_id, role 'super_admin')`.
  4. Send an invite or recovery link.
  5. Record the bootstrap: `insert into audit_logs (action = 'user.bootstrap_super_admin', …)` with the
     service role, or call `log_audit_event` through a service-role client.

  Direct writes to `profiles.status` and `user_roles` are allowed for the service role and blocked for
  signed-in users. The last-super-admin guard means the script can only ever add super admins.
- **Disabling access:** `set_user_status(user, 'disabled')` blocks all data access immediately, because
  every policy requires an active profile. To stop GoTrue from issuing tokens as well, the server
  action should also call `auth.admin.updateUserById(id, { ban_duration: '876000h' })`, and `'none'` to
  re-enable.

## 16. Applying the schema to hosted Supabase

**Option A: Supabase CLI (recommended).**

```bash
supabase login
supabase link --project-ref <project-ref>        # asks for the database password
supabase db push                                 # applies supabase/migrations/* in order, records them
pnpm db:types                                    # with DATABASE_URL pointing at the project (or supabase gen types)
```

**Option B: SQL editor.** Open each file in `supabase/migrations/` **in filename order**, paste it and
run it. They run as `postgres`, the same role `db push` uses. No superuser is needed: extensions go
into `extensions`, and the trigger on `auth.users` and the `storage.objects` policies are allowed for
`postgres`.

**After the first push, set these in the dashboard to match `supabase/config.toml`:**
- **Authentication → URL configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`. Redirect URLs =
  `<site>/auth/callback`, `<site>/auth/confirm` and `<site>/reset-password`.
- **Authentication → Sign in/up:** e-mail sign-up on, "Confirm email" on, minimum password 8 with
  lower/upper/digits.
- **Authentication → SMTP:** your SMTP or Resend SMTP, so invitations and resets are deliverable.
- **Storage:** the buckets are created by the migrations. The global file size limit must be ≥ 20 MB.
- **API → Exposed schemas:** `public` and `graphql_public` only. Never expose `private`.

**Then:**
1. Run `pnpm bootstrap:super-admin --email …`.
2. Sign in and complete the setup wizard.
3. Import employees.

The hosted Data API returns at most 1000 rows per request, so lists and exports page with `.range()`.

## 17. Tests, generated types and local fixtures

**Tests:** `supabase/tests/run.sh` runs every `NN_*.sql` file with `psql` against `DATABASE_URL`. Each
file:
1. Opens a transaction.
2. Includes `_helpers.sql` (pg_temp helpers).
3. Creates its own auth users, employees and data.
4. Impersonates users with `set_config('role', 'authenticated')` and
   `request.jwt.claims = {"sub": <uuid>, "role": "authenticated"}`.
5. Prints `PASS`/`FAIL` per check, then **rolls back**.

The script exits non-zero on any failure. Assertions are relative to what already exists, so the
suite also passes on a database that holds the QA fixtures or real data: document numbers are checked
against the current `document_sequences` value (locked `FOR UPDATE` for the test), storage counts are
scoped to the file's own fixture paths, and the organization-reset check compares the configuration with
a second `seed_defaults()` run instead of hard-coded seed counts.

| File | Covers |
|---|---|
| `01_rls_isolation.sql` | employee isolation (rows, compensation, bank, insurance, dependents, documents, requests, leave, comments, notifications, full `profiles` rows vs `profile_cards`); manager visibility (reports' rows, leave and team requests; no compensation, bank, insurance, documents or internal comments); HR visibility; pending/disabled see only their profile; anon limited to the two public RPCs |
| `02_permissions.sql` | hr_officer vs hr_admin driven by `role_permissions` (and changing rows changes access); audit masking and append-only for super admin, service role and owner; `log_audit_event` service-role only (users, disabled users and anon refused), `record_login` once per session and refused for disabled accounts; escalation attempts (profile status/link, user_roles inserts, super-admin grants, last super admin via RPC and service role, custom org roles, document path hijacking, certificate issuing); function-privilege lint |
| `03_requests_workflow.sql` | numbering, manager→HR routing, notifications and params, self-approval, HR acting on a manager step, acting twice, start/complete/final states, skipped manager steps, non-report manager, return and resume at the right step, reassign, cancel rules, drafts, form validation and visibility, bank and info-update effects, SLA business-day math with holidays, policy vs `can_view_request` equivalence |
| `04_leave.sql` | day counting (working/calendar, holidays); submit/approve/reject/cancel-before/cancel-after/return-resubmit maths with no double deduction; availability with holds; overlap, gender, max days, empty range, attachment; non-deducting types; adjustments, set/initialize balances, direct-edit restrictions |
| `05_storage.sql` | `storage.objects` policies per bucket and role (own vs others' documents, confidential files, avatars, request attachments by requester/approver/HR, certificate PDFs valid vs revoked, stamp, branding public read and admin write) |
| `06_registration_public_admin.sql` | sign-up hook (pending, untrusted metadata, matching, reviewer notifications, invited users, e-mail sync), review flow, `verify_certificate` output, `global_search` scoping and Arabic folding, `dashboard_stats` per role, e-mail claim, expiry alerts, template versioning, `reset_organization` |

**Types:** `scripts/gen-db-types.mjs` introspects `public` with `psql -At` and writes
`src/types/database.ts` in the Supabase CLI shape:
- `Database → public → Tables/Views/Functions/Enums/CompositeTypes`
- the `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>` and `CompositeTypes<>` helpers
- `__InternalSupabase.PostgrestVersion = "13"`

Generated and identity-always columns are `?: never` in Insert and Update. Table-returning functions
return arrays of row objects, and functions without arguments have `Args: never`. `--check` fails when
the file is stale.

**Local fixtures:** `scripts/dev/seed-local-fixtures.mjs` is local only (see `scripts/dev/README.md`).

## 18. Writing new migrations

- Add a new file `supabase/migrations/<yyyymmddhhmmss>_<name>.sql`. Never edit an applied one.
- New table:
  1. `alter table … enable row level security`, with explicit policies `to authenticated` using the
     helpers wrapped in `(select …)`.
  2. `revoke all on <table> from anon`, and revoke `truncate, references, trigger` from `authenticated`.
  3. Index every FK.
  4. Attach `private.set_audit_fields` and, for key data, `private.audit_row_change('<entity>')`.
- New function: `set search_path = ''` and schema-qualified names. For security definer RPCs, check
  the caller first and raise `hr:errors.<key>`. **Supabase grants EXECUTE on new functions to `anon`**:
  add `revoke execute on function … from public, anon;` unless the function is meant to be public.
- Keep sensitive column names in the masking list (`private.mask_changes`) up to date.
- Redefining `private.seed_defaults()`: keep every `perform private.seed_*()` call, including
  `private.seed_auth_email_templates()` (section 15).
- A new `employees` column needs an explicit column grant (section 5, *Employee column scope*).
- Security invoker functions and views must not read `public.profiles` for other users' names or
  links: use `public.profile_cards` (full rows are visible only to the user and org viewers).
- Run `supabase/tests/run.sh` and `pnpm db:types` before committing.

## 19. Known limitations

- ~~Managers can read the whole `employees` row of their direct reports~~ — fixed by
  `20260928210301_employees_fix_personal_column_scope.sql`: column privileges limit `authenticated` to
  the directory / employment columns; identity and personal columns are read through `employee_records`
  (masked per row by `private.employee_personal`).
- **Leave spanning two calendar years is charged to the start date's year.**
- ~~`verify_certificate` is keyed by the sequential certificate number~~ — fixed by
  `20260928210702_certificates_fix_verification_code.sql`: holder details need the per-certificate
  verification code printed on the PDF (certificates issued before it verify with their status only).
- **`profile_cards` is a definer view.** It bypasses RLS on `profiles` by design and carries its own row
  filter (same visibility as the former `profiles` policy branch) and only four display columns; it is
  SELECT-only. Keep new columns out of it unless every viewer may see them.
- **Workflow edits apply to requests already in flight.** The next step is resolved when the request
  gets there; no snapshot is taken at submission.
