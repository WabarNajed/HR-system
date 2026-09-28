# HR Portal — Architecture & Engineering Contract

This document is the binding contract for everyone (human or agent) building this
codebase. When code and this document disagree, fix one of them in the same change.

---

## 1. Product scope

A premium, bilingual (Arabic-first, RTL / English LTR) internal HR portal for **one
active organization per deployment** (not multi-tenant). Everything organization
specific (name, logo, branding, departments, job titles, locations, leave types,
request types, workflows, document & email templates) is data, editable by the
Super Admin at runtime — never hardcoded.

Roles: `super_admin`, `hr_admin`, `hr_officer`, `manager`, `employee`.

---

## 2. Stack (pinned majors)

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (CSS-first `@theme`), shadcn/ui-style components hand-written on Radix primitives (`radix-ui` package) — the shadcn registry is NOT reachable from CI sandboxes, so components live in `src/components/ui` as source |
| Icons | `lucide-react` only |
| i18n | `next-intl` v4, **no locale in URL**, locale from cookie `NEXT_LOCALE` → profile preference → org default → `ar` |
| DB / Auth / Storage | Supabase (Postgres + RLS, Supabase Auth, private Storage buckets) via `@supabase/ssr` + `@supabase/supabase-js` |
| Forms | `react-hook-form` + `zod` + `@hookform/resolvers` |
| Tables | `@tanstack/react-table` (server-side pagination/sort/filter via URL search params) |
| Toasts | `sonner` · Command palette: `cmdk` · Charts: `recharts` · Dates: `date-fns` + `react-day-picker` |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Rich text | TipTap (`@tiptap/react`, `@tiptap/starter-kit`, text-align, underline, table, placeholder) |
| Excel / CSV | `exceljs` (read + write XLSX) and `papaparse` (CSV). CSV exports are UTF‑8 **with BOM** so Excel renders Arabic |
| PDF | HTML → headless Chromium (`puppeteer-core`; on Vercel `@sparticuz/chromium`; locally `CHROMIUM_EXECUTABLE_PATH`). Only reliable way to get correct Arabic shaping + RTL. Fonts embedded as base64 `@font-face` from `@fontsource/ibm-plex-sans-arabic` |
| QR | `qrcode` |
| Email | Resend REST API (`RESEND_API_KEY`) **or** SMTP via `nodemailer` (`SMTP_*`); if neither is configured, emails are recorded in `email_logs` with status `skipped` |
| Zip (backup) | `jszip` |
| Package manager | `pnpm` |
| Hosting | Vercel (Hobby/Pro) + Supabase (Free/Pro). No other paid services |

---

## 3. Repository layout

```
docs/                       ARCHITECTURE.md (this), DEPLOYMENT.md, DATA-IMPORT.md
locales/ar/<namespace>.json Arabic messages, one file per namespace
locales/en/<namespace>.json English messages (identical key sets)
supabase/config.toml        Supabase CLI config (local dev via `supabase start`)
supabase/migrations/*.sql   Ordered, idempotent-where-possible migrations (the ONLY schema source)
supabase/tests/*.sql        RLS / RPC test scripts
scripts/                    Node/TS CLIs (bootstrap-super-admin, analyze-workbook, import-employees, gen-db-types, check-i18n)
e2e/                        Playwright specs + local-only fixture setup
src/
  app/
    layout.tsx              <html lang dir>, fonts, providers, runtime brand CSS vars
    page.tsx                redirect → /dashboard
    (auth)/                 login, register, forgot-password, reset-password, pending-approval, account-disabled
    auth/callback/route.ts  code exchange (OAuth-less: email links, recovery, invite)
    auth/confirm/route.ts   token_hash verification (invite / recovery / signup)
    (app)/layout.tsx        authenticated shell (sidebar + header); redirects pending/disabled users
    (app)/dashboard …       all authenticated routes (see §9)
    verify/[certificateNumber]/page.tsx   PUBLIC certificate verification
    api/                    route handlers: export, downloads (signed URL redirects), pdf, cron
  components/
    ui/                     primitives (button, input, select, dialog, sheet, tabs, table, badge, card, …)
    shell/                  sidebar, header, breadcrumbs, global search, notification bell, language switch, user menu, theme toggle
    data-table/             DataTable, toolbar, faceted filter, pagination, column visibility, export menu, skeleton
    shared/                 PageHeader, EmptyState, StatCard, StatusBadge, SlaBadge, FormSection, FormGrid,
                            ConfirmDialog, FileDropzone, DatePicker, DateRangePicker, EmployeeAvatar, EmployeePicker,
                            KeyValueGrid, SectionCard, Timeline, LoadingButton, ErrorState, PermissionGate
  features/<module>/        module code: components/, actions.ts ('use server'), queries.ts (server-only), schemas.ts, types.ts, export-datasets.ts
  lib/
    supabase/               server.ts (RLS client from cookies), client.ts (browser), admin.ts (service role, server-only), proxy.ts (session refresh)
    auth/                   session.ts (getSessionContext – React cache), guards.ts (requireUser, requirePermission, requireRole)
    permissions.ts          MODULES, ACTIONS, ROLE keys, can()
    i18n/                   config.ts (locales, dir()), request.ts (next-intl getRequestConfig), messages.ts (namespace registry), actions.ts (setLocale)
    action.ts               defineAction / ActionResult helpers
    errors.ts               DB/Auth error → i18n key mapping (never leak raw errors)
    audit.ts                logAuditEvent() → RPC log_audit_event
    notifications.ts        deliverEmailsForNotifications()
    email/                  send.ts (Resend | SMTP | skipped), render.ts (placeholders + branded layout)
    storage.ts              bucket names, path builders, signed URL helpers
    pdf/                    render.ts (HTML → PDF via Chromium), fonts.ts
    export/                 engine.ts (rows → xlsx/csv/pdf), registry.ts (dataset lookup), types.ts
    dates.ts                Gregorian/Hijri formatting, business-day math, expiry buckets
    format.ts               locale-aware number / currency / date formatting
    list-params.ts          parse page/pageSize/q/sort/filters from searchParams
  types/database.ts         GENERATED from the live schema by scripts/gen-db-types.mjs — never hand-edit
  proxy.ts                  Next 16 proxy (formerly middleware): Supabase session refresh + unauthenticated redirect
```

Path alias: `@/*` → `src/*`. Locale files are imported by `src/lib/i18n/messages.ts`.

---

## 4. Internationalization

* **Every user-facing string** comes from `locales/<lang>/<namespace>.json`. No literal UI strings in TSX
  (exceptions: brand-neutral symbols, numbers, and user/DB data).
* Namespaces (file names; all pre-created, all registered in `src/lib/i18n/messages.ts`):
  `common, nav, auth, dashboard, employees, requests, approvals, leave, documents, certificates, reports,
  notifications, settings, users, roles, masterData, requestConfig, templates, dataManagement, audit, backup,
  search, profile, setup, verify, statuses, enums, errors, validation`
* `ar` and `en` files must have **identical key sets** (`pnpm check:i18n` enforces).
* Arabic is the default. `dir="rtl"` for `ar`, `dir="ltr"` for `en`, set on `<html>`.
* Use logical CSS only: `ms-/me-/ps-/pe-/start-/end-/text-start/text-end`, `rtl:` variants for icons that
  imply direction (chevrons/arrows get `rtl:rotate-180`). Never `ml-/mr-/pl-/pr-/left-/right-` for layout.
* Language switch = server action that sets cookie `NEXT_LOCALE` (1 year, `sameSite=lax`) and updates
  `profiles.preferred_language`; on sign-in the cookie is set from the profile preference.
* Bilingual DB content uses `name_ar` / `name_en` (and `description_ar/_en`, `label_ar/_en`, …).
  Display helper `localized(row, 'name', locale)` falls back to the other language when one is empty.
  Employee names: show `name_en` in English only if present; otherwise the real Arabic name. Never invent.
* Dates: Gregorian `dd MMM yyyy` via `Intl` with the active locale (Arabic uses Latin digits by default
  — `ar-SA-u-nu-latn` — for readability of IDs and dates); Hijri shown where the domain uses it
  (Iqama expiry) via `Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura')`.
* Generic operation error text (`errors.generic`):
  ar: `تعذر تنفيذ العملية. حاول مرة أخرى.` · en: `Unable to complete the operation. Please try again.`

---

## 5. Design system (original identity — "Oasis")

Professional, dense, operational. Benchmarked for quality against mature GCC HR suites but **not** copying
any brand. Tokens live in `src/app/globals.css` (`@theme` + CSS variables) and are overridable at runtime
by Branding settings (primary/secondary colors injected as CSS variables in the root layout).

* **Font**: IBM Plex Sans Arabic (Arabic + Latin), weights 400/500/600/700, self-hosted via
  `next/font/local` from `@fontsource/ibm-plex-sans-arabic`. Numerals: tabular where in tables.
* **Type scale**: page title 26px/600 · section title 18px/600 · card title 15-16px/600 · body & table 14px
  (Arabic 14.5–15px effective) · secondary 12.5–13px · never below 12px for meaningful text.
* **Spacing**: 4 / 8 / 12 / 16 / 24 / 32 only. Page padding 24px desktop, 16px mobile. Card padding 16–20px.
* **Radius**: 10px cards/dialogs, 8px inputs/buttons, 6px badges.
* **Palette (light)**: canvas `#F5F7F8`, surface `#FFFFFF`, border `#E3E8EA`, text `#0F1B1F`, muted
  `#5B6B70`, **primary (default) `#0F5E6B` deep teal**, **secondary/accent `#B8862F` desert gold**,
  success `#12805C`, warning `#B25E09`, danger `#C8322B`, info `#1F6FD1`.
  Sidebar uses a deep teal-night surface (`#0B2A31`) with light text in light mode.
* **Dark mode**: designed, not inverted — canvas `#0A1215`, surface `#101B1F`, raised `#15242A`, border
  `#1F3037`, text `#E6EEF0`, muted `#93A5AA`, primary lightened for contrast.
* **Density**: header 56px; sidebar 256px expanded / 68px collapsed (persisted); table row 44–48px;
  inputs 36–38px.
* **Layout rules**: dashboards and tables use full width (`max-w-none`) with responsive grids; forms are
  width-controlled (max ~1040px, 2 columns ≥ md); settings = left/right nav (logical start) + content;
  never leave giant empty regions — empty states are compact (≈180–260px) with icon, title, description,
  action.
* **States**: every async view has a skeleton (`loading.tsx` or Suspense fallback); every button shows
  pressed/loading/disabled; every mutation ends with a toast (success or mapped error). No infinite
  spinners: all client fetches have timeouts and an error state with retry.
* **Charts**: recharts with the shared palette (`src/lib/chart-colors.ts`), RTL-aware axis orientation.
* **Mobile (390×844)**: sidebar becomes a sheet; tables collapse to card lists or horizontal scroll with
  sticky first column; sticky bottom action bars for forms; header shows search icon → full-screen search.

---

## 6. Data model (Postgres, schema `public`; helpers in schema `private`)

Conventions: `uuid` PKs (`gen_random_uuid()`), `created_at`, `updated_at` (trigger), `created_by`,
`updated_by` (default `auth.uid()`, trigger-maintained) on all business tables; soft delete via
`archived_at` / `is_active` where appropriate; text + CHECK constraints instead of Postgres enums (easier
to evolve); all FKs indexed. Full column-level detail, RLS, RPC and workflow reference: `docs/DATABASE.md`
(generated TS types: `src/types/database.ts`).

### Organization & settings
* `organizations` (singleton; `singleton boolean unique default true check (singleton)`): name_ar/en,
  legal_name_ar/en, logo_path, address_ar/en, city, country, website, phone, hr_email,
  commercial_registration, vat_number.
* `organization_settings` (singleton): currency (`SAR`), timezone (`Asia/Riyadh`), default_language
  (`ar`), working_days int[] (0=Sun…6=Sat, default `{0,1,2,3,4}`), weekend_days int[] (`{5,6}`),
  work_start time, work_end time, fiscal_year_start_month int, portal_name_ar/en, primary_color,
  secondary_color, login_title_ar/en, login_subtitle_ar/en, login_image_path, stamp_path,
  signature_path, signatory_name_ar/en, signatory_title_ar/en, allow_self_registration bool,
  session_timeout_minutes, email_from_name, email_reply_to, expiry_alert_days int[] (`{90,60,30,14,7}`),
  setup_completed_at.
* `system_settings` (key text PK, value jsonb) — misc flags.

### Identity & access
* `profiles` (id = `auth.users.id`): email, full_name, mobile, employee_id (FK employees, **unique**,
  nullable), status (`pending|info_requested|active|rejected|disabled`), registration_employee_number,
  registration_note, matched_employee_id (registration match suggestion), review_note (HR note to the
  applicant), reviewed_by, reviewed_at, preferred_language (`ar|en|null`), theme (`light|dark|system`),
  last_login_at, invited_at.
  Created by trigger on `auth.users` insert (status `pending` for self sign-up; `active` when created by an
  admin invite via `raw_app_meta_data.invited_by_admin`). `raw_user_meta_data` is untrusted input.
  Full rows are readable only by the user and org viewers; everyone else reads other users' names through
  the read-only view **`profile_cards`** (id, full_name, employee_id, status) — see §7.
* `roles` (key unique: `super_admin|hr_admin|hr_officer|manager|employee` + custom), name_ar/en,
  description_ar/en, is_system, rank int, **data_scope** (`own|team|organization`: which rows the role's
  permissions reach — HR roles `organization`, manager `team`, employee `own`; see §7).
* `user_roles` (user_id, role_id) unique pair.
* `role_permissions` (role_id, module, action) unique triple.
  * modules: `employees, personal_data, bank, insurance, documents, requests, approvals, leave,
    certificates, reports, settings, audit, users`
  * actions: `view, create, edit, approve, export, administer`

### Organization structure (all bilingual, `code` unique, `is_active`)
`departments` (parent_id, head_employee_id), `job_titles`, `locations` (city, country),
`cost_centers`.

### Employees
* `employees`: employee_number (unique, nullable — imported workbooks may lack it), name_ar, name_en,
  company_email, personal_email, mobile, alt_mobile, gender (`male|female`), nationality (text as provided),
  date_of_birth, marital_status (`single|married|divorced|widowed`), address;
  department_id, division, section, job_title_id, grade, manager_id (self FK), employment_type
  (`full_time|part_time|contract|temporary|intern`), employment_status
  (`active|probation|on_leave|suspended|resigned|terminated`), joining_date, probation_end_date,
  contract_start_date, contract_end_date, termination_date, location_id, cost_center_id;
  national_id (Iqama / National ID number, unique when not null), id_type (`iqama|national_id`),
  iqama_issue_date, iqama_expiry_date, iqama_expiry_hijri (text, as provided), iqama_profession,
  passport_number, passport_expiry_date, employer_number, is_outside_kingdom (bool, nullable);
  emergency_contact_name, emergency_contact_relationship, emergency_contact_mobile;
  avatar_path (`{id}/avatar/…`), extra_data jsonb (unmapped import columns preserved verbatim), import_id,
  archived_at, archived_by, search_text (generated lower-case number/names/company e-mail, trigram
  indexed) + audit columns.
  **Column scope:** `authenticated` may SELECT only the directory / employment / compliance columns of
  the table (column grants). The identity / personal columns (national_id, passport_number,
  date_of_birth, marital_status, address, personal_email, iqama_issue_date, iqama_profession,
  employer_number, is_outside_kingdom, emergency contact) and extra_data are read through the view
  **`employee_records`** (same rows under RLS, full row shape, those columns NULL unless the caller is
  the employee or holds org `personal_data.view/edit`; extra_data: org `personal_data.view` or
  `employees.create`). A new non-sensitive column needs an explicit `grant select (col)`.
* `employee_compensation` (employee_id PK): basic_salary, housing_allowance, transport_allowance,
  other_allowance, total_salary (generated), currency, effective_date. **HR + owner only.**
* `employee_bank_accounts`: employee_id, bank_name, iban, account_holder, is_primary. **HR + owner only.**
* `employee_insurance`: employee_id, dependent_id (nullable), provider, policy_number, class,
  member_number, start_date, expiry_date, status. **HR + owner only.**
* `employee_dependents`: employee_id, name_ar, name_en, relationship
  (`spouse|son|daughter|father|mother|other`), date_of_birth, nationality, national_id, iqama_expiry_date,
  passport_number, passport_expiry_date, insurance_status (`insured|not_insured|pending`),
  insurance_member_number, notes.
* `employee_documents`: employee_id, document_type (`employment_contract|national_id|iqama|passport|
  medical_insurance|iban_certificate|educational_certificate|professional_certificate|medical_report|visa|
  signed_hr_form|other`), document_number, issue_date, expiry_date, status
  (`valid|expired|pending_review|rejected|archived`), storage_path, file_name, file_size, mime_type,
  notes, is_confidential (default true for medical_report), uploaded_by, review_note, reviewed_by,
  reviewed_at. The file a row references is immutable in Storage (see §7 Storage).

### Leave
* `leave_types`: code unique (`annual, sick, emergency, unpaid, marriage, maternity, paternity,
  bereavement, hajj, exam, other`), name_ar/en, is_paid, deducts_balance, default_entitlement numeric,
  max_days_per_request, day_count_basis (`working|calendar`), requires_attachment, gender_restriction
  (`male|female|null`), color, sort_order, is_active.
* `leave_balances`: employee_id, leave_type_id, year, opening_balance, entitlement, adjustment,
  used, pending, **remaining = opening_balance + entitlement + adjustment − used** (generated column);
  unique (employee_id, leave_type_id, year).
* `leave_adjustments`: leave_balance_id, amount, reason, old_remaining, new_remaining, changed_by,
  changed_at.
* `leave_requests`: request_id (FK hr_requests, unique), employee_id, leave_type_id, start_date,
  end_date, return_date, days, balance_effect (`none|pending|used|reversed`) — the state machine that
  prevents double deduction, year.
* `public_holidays`: name_ar/en, start_date, end_date, is_active.

### Requests & workflow
* `request_types`: key unique, category, name_ar/en, description_ar/en, icon (lucide kebab-case name), color,
  sla_business_days, requires_manager_approval, requires_hr_approval, allow_attachments,
  is_active, sort_order, workflow_id, is_system (seeded types with built-in effects; deactivate, never delete).
* `request_fields`: request_type_id, key, field_type
  (`short_text|long_text|number|currency|date|datetime|time|dropdown|multi_select|yes_no|attachment|
  leave_type|dependent|employee|email|phone`), label_ar/en, help_ar/en, placeholder_ar/en, required,
  options jsonb (`[{value,label_ar,label_en}]`), sort_order, visibility jsonb
  (`{"field":"subtype","in":["iqama_renewal"]}` or null), validation jsonb, is_active,
  is_system (system fields referenced by effects — `subtype`, `start_date`, `end_date`, `leave_type`,
  `iban`, … cannot be deleted, only relabeled).
* `request_workflows`: request_type_id, name_ar/en, is_active.
* `request_workflow_steps`: workflow_id, step_order, step_type (`manager|hr|role|user`), name_ar/en,
  approver_role_key, approver_user_id, sla_business_days, can_return, can_reassign.
* `hr_requests`: request_number (`HR-YYYY-000001`, assigned on first submission — drafts have none),
  request_type_id, subtype, employee_id, requester_id (profile), status (`draft|submitted|
  pending_manager_approval|pending_hr_review|returned|approved|rejected|in_progress|completed|cancelled`),
  current_step_id, current_step_order, current_step_type (`manager|hr|role|user` while pending),
  returned_from_step_order, assigned_to (profile), current_approver_id (profile, for manager/user steps),
  priority (`low|normal|high|urgent`), submitted_at, due_at, completed_at, cancelled_at, title (computed summary).
* `hr_request_values`: request_id, field_key, value jsonb, unique (request_id, field_key).
* `request_attachments`: request_id, field_key, storage_path (`requests/{request_id}/…`, enforced), file_name,
  file_size, mime_type, uploaded_by.
* `request_comments`: request_id, author_id, author_name (snapshot), body, is_internal (HR-only when true).
* `request_history`: request_id, action, from_status, to_status, actor_id, actor_name (snapshot), note,
  metadata jsonb.
* `request_approvals`: request_id, step_id, step_order, step_type, approver_id, approver_name (snapshot),
  decision (`pending|approved|rejected|returned|reassigned|skipped`), comment, decided_at.
* `document_sequences`: prefix, year, last_value (PK prefix+year) — for `HR-` and `CERT-` numbers.

### Certificates & templates
* `certificate_templates`: key unique, certificate_type (`salary|employment|salary_employment|
  experience|custom`), variant (e.g. `general|bank|embassy`), name_ar/en, language (`ar|en|bilingual`),
  content_ar (HTML), content_en (HTML), header_html, footer_html, show_logo, show_stamp,
  show_signature, show_qr, is_active, is_default, current_version, published_at.
* `certificate_template_versions`: template_id, version, snapshot jsonb, change_notes, changed_by,
  changed_at.
* `certificates`: certificate_number (`CERT-YYYY-000001`), employee_id, request_id, template_id,
  template_version, certificate_type, language, addressed_to, purpose, issue_date, status
  (`valid|revoked`), storage_path, issued_by, revoked_at, revoke_reason, verification_code (12 random
  characters printed on the PDF / in the QR link; required by `/verify` to reveal holder details;
  masked in the audit trail).

### Communication
* `notifications`: user_id, type, params jsonb, link, entity_type, entity_id, read_at, emailed_at.
  **Text is rendered client-side from `locales/*/notifications.json` → `types.<type>.title/body` with
  `params`** so notifications are fully bilingual.
  Types: `request_submitted, approval_required, request_approved, request_rejected, request_returned,
  request_assigned, request_in_progress, request_completed, request_cancelled, request_comment,
  registration_submitted, registration_approved, registration_rejected, registration_info_requested,
  certificate_issued, leave_balance_adjusted, expiry_alert, account_invited`.
* `notification_settings`: event_key unique, in_app_enabled, email_enabled, recipients jsonb.
* `email_templates` (+ placeholders jsonb): key unique (`account_invitation, registration_confirm, registration_submitted, registration_approved,
  registration_rejected, password_reset, request_submitted, approval_required, request_approved,
  request_rejected, request_returned, request_completed, iqama_expiry, passport_expiry,
  insurance_expiry, contract_expiry, document_expiry`), name_ar/en, subject_ar/en, body_ar/en (HTML),
  is_active. Placeholders `{{employee_name}} {{manager_name}} {{request_number}} {{request_type}}
  {{request_status}} {{company_name}} {{link}}` (+ type specific).
* `email_logs`: recipient, subject, template_key, related_entity_type, related_entity_id, status
  (`sent|failed|skipped`), provider, provider_message_id, error, sent_at. Written only by the service
  role (`log_email`).

### Data management & audit
* `imports`: import_type, file_name, status (`uploaded|validated|importing|completed|failed|cancelled`),
  total_rows, valid_rows, warning_rows, error_rows, imported_rows, mapping jsonb, options jsonb,
  summary jsonb, created_by, completed_at.
* `import_rows`: import_id, row_number, raw jsonb, mapped jsonb, status (`valid|warning|error|imported|
  skipped`), errors jsonb, warnings jsonb, entity_id.
* `audit_logs` (bigint identity PK): actor_id, actor_email, action (dot-namespaced, e.g.
  `employee.update`), entity_type, entity_id, employee_id (related employee → Activity tab), summary,
  changes jsonb (sensitive fields masked: salary components, IBAN, national ID, passport number,
  certificate verification code), ip, user_agent, created_at. **Append-only**: no UPDATE/DELETE
  grants or policies for anyone (plus a guard trigger). Written by row triggers, definer RPCs and the
  service-role `log_audit_event` only.

---

## 7. Authorization

### Helper functions (schema `private`, `security definer`, `stable`, `set search_path = ''`)
`private.current_profile_status()`, `private.is_active_user()`, `private.has_role(key)`,
`private.is_super_admin()`, `private.is_hr()` (active holder of an organization-scoped role:
super_admin/hr_admin/hr_officer or a custom HR role), `private.has_permission(module, action)` (via any
role; super_admin ⇒ true), `private.has_org_permission(module, action)` (via an organization-scoped role
only; super_admin ⇒ true), `private.current_employee_id()`, `private.is_manager_of(employee_id)` (direct
report), `private.can_view_employee(employee_id)` (self ∨ manager_of ∨ has_org_permission('employees','view')),
`private.can_view_request(request_id)`.

Every helper returns false for users whose profile status ≠ `active`.

**Permissions vs. data scope**: `role_permissions` says which modules/actions a role may use (UI gating,
RPC checks → `has_permission`); *which rows* depends on `roles.data_scope`. Org-wide row access in RLS
always uses `has_org_permission`, so e.g. the manager role's `employees.view` means "my team", not "everyone".

### RLS matrix (enforced in the database — UI hiding is cosmetic only)

| Table | Employee | Manager | HR officer / HR admin | Super admin |
|---|---|---|---|---|
| employees | own row | + direct reports (read) | per `employees.*` perms (identity columns need `personal_data.edit`) | all — table columns limited to directory / employment data; identity / personal columns via `employee_records` (self or org `personal_data.view/edit`), see §6 |
| employee_compensation, employee_bank_accounts | own (read) | ✗ | `bank.*` perms | all |
| employee_insurance | own (read) | ✗ | `insurance.*` perms | all |
| employee_dependents | own (read) | ✗ | `personal_data.*` perms | all |
| employee_documents | own (read, non-confidential + own uploads) | ✗ | `documents.*` perms | all |
| hr_requests (+values, attachments, history, approvals) | own (drafts: requester only) | + current/previous approver; direct reports' requests whose type has a manager step | `requests.*` perms (no drafts) | all |
| request_comments | own request, `is_internal=false` only | same as requests, non-internal | all incl. internal | all |
| leave_balances / leave_requests | own | direct reports (read) | `leave.*` | all |
| certificates | own (valid) | ✗ | `certificates.*` | all |
| notifications | own only | own | own | own |
| audit_logs | ✗ | ✗ | `audit.view` | all (read only) |
| config tables (types, templates, settings, master data) | read active rows | read | read; write per `settings.*` | all |
| profiles (full row: e-mail, mobile, last login, registration / review notes) | own only | own only | all (`is_hr` or org `users.view`) | all — self may update only full_name, mobile, preferred_language, theme (and registration fields while pending) |
| profile_cards (read-only view: id, full_name, employee_id, status) | own + manager + direct reports + HR staff | same | all | all — use it for names of approvers, assignees, requesters, uploaders, reviewers |
| user_roles / role_permissions | own roles / read | same | `users.view` / write `users.administer` | all |

Mutations with multi-row effects run through **`security definer` RPCs** that check authorization
explicitly and do all side effects atomically (status, history, approvals, audit, notifications, leave
balance, sequences):

* `public.create_request_draft(p_request_type_id uuid, p_values jsonb, p_subtype text default null, p_employee_id uuid default null) → uuid`
* `public.update_request_draft(p_request_id uuid, p_values jsonb, p_subtype text default null) → void` (p_values replaces the stored values)
* `public.submit_request(p_request_id uuid) → jsonb` (`{status, notification_ids}`) — also resubmits returned requests, resuming at `returned_from_step_order`
* `public.act_on_request(p_request_id uuid, p_action text, p_comment text default null, p_target_user uuid default null) → jsonb`
  actions: `approve|reject|return|reassign|start|complete|cancel`
* `public.add_request_comment(p_request_id uuid, p_body text, p_is_internal boolean) → uuid`
* `public.count_leave_days(p_leave_type_id uuid, p_start date, p_end date) → numeric`
* `public.adjust_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year int, p_amount numeric, p_reason text) → uuid`
* `public.approve_registration(p_profile_id uuid, p_employee_id uuid default null, p_role_key text default 'employee') → void`, `public.reject_registration(p_profile_id uuid, p_reason text)`, `public.request_registration_info(p_profile_id uuid, p_note text)`
* `public.set_user_roles(p_user_id uuid, p_role_keys text[])` (only super_admin may grant/revoke `super_admin`; the last super admin can never be removed or disabled)
* `public.next_document_number(p_prefix text) → text`
* `public.log_audit_event(p_action text, p_entity_type text default null, p_entity_id text default null, p_summary text default null, p_changes jsonb default null, p_actor_id uuid default null, p_ip text default null, p_user_agent text default null) → void`
  — **service role only** (a user JWT can never write the audit trail); called by `lib/audit.ts` after the action's own permission check, with the verified session user as actor
* `public.global_search(p_query text, p_locale text default 'ar', p_limit int default 20) → table(kind, id, title, subtitle, href)` (security invoker → RLS applies)
* `public.verify_certificate(p_number text, p_code text default null) → table(certificate_number, employee_name, certificate_type, issue_date, status)` — granted to `anon`; the number alone returns only number + status; `employee_name`, `certificate_type` and `issue_date` are filled only when `p_code` matches the certificate's `verification_code`; returns nothing else
* `public.get_public_branding() → jsonb` — granted to `anon` (portal names, logo URL, colors, login texts)
* `public.dashboard_stats() → jsonb` (role-aware counts)
* `public.reset_organization(p_confirmation text) → void` (super_admin only, phrase `RESET ORGANIZATION`)
* Additional RPCs (see `docs/DATABASE.md` §7): `set_user_status(p_user_id, p_status, p_note default null)`,
  `set_user_employee(p_user_id, p_employee_id)`, `record_login()`, `get_employee_manager(p_employee_id) → jsonb`,
  `get_request_workflow(p_request_id) → table`, `set_leave_balance(…)`, `initialize_leave_balances(p_year, p_employee_id default null)`,
  `claim_notification_emails(p_notification_ids uuid[]) → table`, `log_email(…)` (**service role only**), `generate_expiry_alerts()` (cron),
  `publish_certificate_template(p_template_id, p_change_notes default null)`, `restore_certificate_template_version(p_template_id, p_version)`.
* RPC errors are raised as `hr:errors.<key>` (list in `docs/DATABASE.md` §13).

Server-side TypeScript still checks permissions before calling anything (defense in depth) using
`requirePermission(module, action)`; the service-role client (`lib/supabase/admin.ts`) is used **only**
for Auth admin operations (invite, create/link/disable users, bootstrap), org-reset storage cleanup and
append-only bookkeeping (`log_audit_event` via `lib/audit.ts`, `log_email` via `lib/email/send.ts`),
always after an explicit role check.

### Storage (all buckets private; access via short-lived signed URLs)
| Bucket | Path | Read | Write |
|---|---|---|---|
| `employee-documents` | `{employee_id}/{document_id}/{file}` · avatars `{employee_id}/avatar/{file}` | owner (non-confidential / own uploads), HR (`documents.view`); avatars: whoever can view the employee | new objects: HR (`documents.create/edit`), owner (own folder, into a `pending_review` document row created first); avatars: `employees.edit`. A file referenced by a document row is never overwritten, moved or deleted — except the uploader's own `pending_review` submission (replace = new path + row update; delete = row first) |
| `request-attachments` | `requests/{request_id}/{uuid}-{file}` | requester, current/previous approvers, HR | requester (draft/returned), HR |
| `certificate-files` | `certificates/{employee_id}/{certificate_number}.pdf`, `branding/stamp.*`, `branding/signature.*` | owner (valid certificates), HR (`certificates.view`); branding: `certificates.view` / `settings.view` | certificates: `certificates.create` only while no certificate row references the path (issued PDFs are immutable); branding: `settings.edit` |
| `branding` (**public**) | `logo/*`, `login/*` | anyone | super_admin / `settings.administer` |

---

## 8. Application conventions

* **Data reads**: Server Components using `createClient()` from `lib/supabase/server.ts` (RLS as the
  user). Lists are paginated server-side (`.range()` + `count: 'exact'`) driven by URL search params
  parsed with `lib/list-params.ts`. Never fetch the whole employees table to the browser.
* **Mutations**: Server Actions in `features/<module>/actions.ts`, validated with zod, returning
  `ActionResult<T> = { ok: true, data?: T, message?: string } | { ok: false, error: string, fieldErrors?: Record<string,string> }`
  where `error`/`message` are **i18n keys** (e.g. `errors.generic`, `employees.toast.saved`). Call
  `revalidatePath` for affected routes. Map all DB/Auth errors through `lib/errors.ts`.
* **Client feedback**: `useTransition` + `LoadingButton`, `toast.success(t(message))` /
  `toast.error(t(error))`. No `alert()`. No silent failures.
* **Guards**: `(app)/layout.tsx` loads `getSessionContext()` once (React `cache`); pages call
  `requirePermission()` / `requireRole()` which render the shared *Forbidden* state or redirect.
* **Sidebar** config in `src/components/shell/nav-config.ts` — items declare the permission required and
  are hidden when unauthorized.
* **Exports**: `GET /api/export/[dataset]?format=xlsx|csv|pdf&<same filters as the page>` — datasets are
  defined in `src/features/<module>/export-datasets.ts` and registered in `src/lib/export/registry.ts`.
  Every export writes an `export.<dataset>` audit event.
* **Downloads**: `GET /api/files/[bucket]/[...path]` checks access via RLS (by reading the owning row with
  the user client) then 302-redirects to a 60-second signed URL.
* **Extension points (avoid cross-module edits)**:
  * Employee profile tabs: each module exports its tab from a fixed file —
    `features/leave/components/employee-leave-tab.tsx`, `features/documents/components/employee-documents-tab.tsx`,
    `features/requests/components/employee-requests-tab.tsx`, `features/certificates/components/employee-certificates-tab.tsx`,
    `features/audit/components/employee-activity-tab.tsx`.
  * Request details type-specific panel: `features/request-panels/index.tsx` maps request type keys →
    panels; certificate panel in `features/certificates/components/certificate-request-panel.tsx`,
    leave panel in `features/leave/components/leave-request-panel.tsx`.
  * Dashboard widgets: `features/dashboard/widgets/*`.
* **No fake data**: never render invented employees, requests, metrics or notifications. Empty tables
  show a compact EmptyState with the relevant action.
* **No dead UI**: every control works or is visibly disabled with a tooltip explaining why.
* **Accessibility**: labelled controls, focus rings, keyboard navigation, `Esc` closes dialogs/sheets,
  AA contrast.

---

## 9. Routes

Public: `/login /register /forgot-password /reset-password /pending-approval /account-disabled
/auth/callback /auth/confirm /verify/[certificateNumber]`

Authenticated: `/ → /dashboard`, `/dashboard`, `/employees`, `/employees/new`, `/employees/[id]`
(tabs via `?tab=`), `/employees/[id]/edit`, `/requests`, `/requests/new`, `/requests/[id]`, `/approvals`,
`/leave`, `/documents`, `/certificates`, `/reports`, `/reports/[reportKey]`, `/reports/builder`,
`/notifications`, `/profile`, `/setup`,
`/settings` (console home), `/settings/organization`, `/settings/branding`, `/settings/users`,
`/settings/roles`, `/settings/pending-registrations`, `/settings/departments`, `/settings/job-titles`,
`/settings/locations`, `/settings/cost-centers`, `/settings/leave-types`, `/settings/public-holidays`,
`/settings/request-types`, `/settings/form-builder`, `/settings/workflows`, `/settings/sla`,
`/settings/document-templates`, `/settings/certificate-templates`, `/settings/email-templates`,
`/settings/notifications`, `/settings/security`,
`/admin/data-management`, `/admin/audit-logs`, `/admin/backup`.

---

## 10. Environment variables (`.env.example` is the reference)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only),
`NEXT_PUBLIC_SITE_URL`, `SUPER_ADMIN_EMAIL` (bootstrap only), `RESEND_API_KEY`, `EMAIL_FROM`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `CHROMIUM_EXECUTABLE_PATH`
(local only), `CRON_SECRET`.

Secrets are never committed. The Super Admin is bootstrapped with `pnpm bootstrap:super-admin --email <addr>`
(creates/links the Auth user, sends a Supabase invite / password-reset link, assigns `super_admin`,
activates the profile, writes an audit event). No passwords in code or git.
