# Data import, export, backup and reset

This document covers **Administration › Data management** (import wizard, templates, export hub,
import history and error reports), the two command-line tools, the **Backup & reset** page, and how to
load the client's employee workbook `Book1(6).xlsx`.

The same import core runs in the web app and in the CLIs (`src/features/data-management/lib/`):
parsing → sheet and header detection → column mapping → validation → batched writes. A file analysed
with the CLI therefore behaves exactly like the same file uploaded in the wizard.

---

## 1. Importing the client workbook `Book1(6).xlsx`

The workbook was not available while the portal was built. Everything below was built for its known
shape (Arabic or English headers in any order, Excel dates, Hijri text dates, blanks and duplicates) and
tested with a synthetic workbook of the same shape.

### Recommended order

1. Sign in as the Super Admin and finish the setup wizard (organization, leave types).
2. Inspect the file — nothing is written:

   ```bash
   pnpm analyze:workbook "Book1(6).xlsx"                 # file only
   pnpm analyze:workbook "Book1(6).xlsx" --db            # also compare with employees already in the database
   pnpm analyze:workbook "Book1(6).xlsx" --json book1-report.json
   ```

   The report lists every sheet, the detected sheet and header row, each column with its detected field
   and confidence (1.00 = exact header match), sample values, missing values per column, duplicates
   (employee number, Iqama, passport, e-mail), invalid dates and e-mails, Hijri dates, and the totals the
   wizard would show (valid / warnings / errors, and how many rows would be created, updated or skipped).
3. Import — either in the browser (**Data management › Import employees**, recommended: you can adjust the
   mapping and see every row) or with the CLI:

   ```bash
   pnpm import:employees "Book1(6).xlsx" --dry-run --report book1-errors.xlsx   # validate + XLSX error report
   pnpm import:employees "Book1(6).xlsx"                                         # asks for confirmation
   ```

4. Download the error report (wizard result step, or **Import history** › row › *Download error report*),
   fix the rejected rows in the original file and import it again with **Update existing records** — rows
   already imported are matched by Iqama and updated instead of duplicated.

### CLI reference

| Command | Options |
|---|---|
| `pnpm analyze:workbook <file>` | `--type <import type>` (default `employees`) · `--sheet <name or 1-based number>` · `--json <out.json>` · `--db` (compare with the database; needs the service role) · `--rows <n>` (problems listed per section, default 20) |
| `pnpm import:employees <file>` | `--dry-run` · `--update-existing` (update employees matched by employee number or Iqama; default: skip them) · `--create-job-titles` (use the Iqama profession as job title when there is no job-title column) · `--no-create-master-data` · `--leave-mode available\|carryover` · `--leave-year <yyyy>` · `--status <employment status>` (default `active`) · `--sheet <name\|number>` · `--report <errors.xlsx>` · `--locale ar\|en` (report language) · `--yes` (no prompt; required when not in a terminal) |

Both read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or
`.env.local`. Point them at the target project (local stack or hosted Supabase). The import CLI:

- records the run in **Import history** exactly like the wizard (source *Command line*), with every row,
  its original values, messages and the created employee;
- writes an `employee.import` audit event and the usual row-level `employee.create` / `employee.update` events;
- sets leave balances directly (the `set_leave_balance` RPC requires a signed-in HR user);
- never creates login accounts.

---

## 2. Column mapping (employees)

Headers are matched after normalization: Arabic hamza/alef variants (أ إ آ ا), taa marbuta (ة/ه),
alef maksura (ى/ي), diacritics and tatweel are folded, the definite article is ignored, and case,
punctuation, brackets and extra spaces don't matter. Column order doesn't matter, and the header row can
be anywhere in the first 30 rows (title rows above it are skipped). Two-row headers (a merged group
header with sub-headers) are combined.

| Known workbook column | Field | Recognized headers (examples) | Rule |
|---|---|---|---|
| Iqama Number | `national_id` (+ `id_type`) | رقم الإقامة · رقم الاقامه · رقم الهوية · الإقامة · Iqama No. · National ID | Kept as text (leading zeros, no reformatting). 10 digits starting with 1 → national ID, 2 → Iqama. Other lengths are imported with a warning. Duplicates in the file: the first row is imported, later rows are rejected. |
| Employee Name | `name_ar` / `name_en` | اسم الموظف · الاسم · الاسم الكامل · Employee Name · Name | **Imported exactly as written** (only leading/trailing spaces removed). A generic "name" column with Latin text goes to `name_en`, Arabic text to `name_ar`. Missing name → row rejected. |
| Gender | `gender` | الجنس · Gender · Sex | ذكر/أنثى, M/F, male/female, رجل/امرأة. Anything else: left empty with a warning, original kept in additional data. |
| Nationality | `nationality` | الجنسية · Nationality | Text as written. |
| Profession / Job Title | `iqama_profession` | المهنة · المهنة / المسمى الوظيفي · Profession | Always stored as the Iqama profession. With *Use the Iqama profession as job title* (`--create-job-titles`) it is also matched to an existing job title or added as one. A separate "Job title / المسمى الوظيفي" column maps to the job title. |
| Passport Number | `passport_number` | رقم الجواز · Passport No | Text as written. Duplicates are warnings. |
| Passport Expiry | `passport_expiry_date` | تاريخ انتهاء الجواز · Passport Expiry | Date rules below. |
| Iqama Issue Date | `iqama_issue_date` | تاريخ إصدار الإقامة · Iqama Issue Date | Date rules; a future issue date is left empty with a warning. |
| Iqama Expiry | `iqama_expiry_date` | تاريخ انتهاء الإقامة · Iqama Expiry | Date rules. A column of Hijri values under a Gregorian header is recognized and mapped as Hijri. |
| Hijri Iqama Expiry | `iqama_expiry_hijri` | انتهاء الإقامة (هـ) · تاريخ انتهاء الإقامة هجري · Hijri Iqama Expiry | **Kept as text exactly as written.** Used to derive the Gregorian expiry (Umm al-Qura) only when the Gregorian column is missing or empty for that row. When both exist and differ by more than 2 days, a warning is shown and both are kept. |
| Date of Birth | `date_of_birth` | تاريخ الميلاد · DOB | Date rules; future dates and ages under 14 are flagged. |
| Outside Kingdom Status | `is_outside_kingdom` | خارج المملكة · داخل / خارج المملكة · حالة التواجد · Outside Kingdom Status | نعم/لا, yes/no, 1/0, خارج/داخل (المملكة), outside/inside. The original text is always kept in additional data. A column named "داخل المملكة / Inside Kingdom" with yes/no values is inverted automatically. |
| Employer Number | `employer_number` | رقم المنشأة · رقم صاحب العمل · Employer Number | Text as written. |
| Email | `company_email` | البريد الإلكتروني · الإيميل · Email · E-mail | Trimmed and lower-cased. **Blank → NULL.** Invalid addresses are left empty with a warning and kept in additional data. Duplicates are warnings (e-mail is not unique). |
| Leave Balance | annual leave balance of the leave year | رصيد الإجازات · الرصيد · Leave Balance | Numbers like `21`, `15 يوم`, `٢٥`, `30.5`. Sets the **current-year annual leave** balance: by default *the current balance* — `opening_balance = value`, `entitlement = 0`, so remaining = value. Option *Carried-over days* (`--leave-mode carryover`) keeps the leave type's yearly entitlement on top. Requires `leave.edit`. |
| any other column | `extra_data` | — | **Preserved verbatim** in `employees.extra_data` under its header text (numbers stay numbers). In the wizard you can instead map it to a field or choose *Don't import*. Row-serial columns (م, #, No.) with 1, 2, 3… are not imported. |

Other employee fields are recognized too (employee number, English name, department, job title, manager,
location, cost center, employment type/status, joining and contract dates, mobile, personal e-mail,
marital status, emergency contact, grade, division, section) — see the template's Instructions sheet.

### Date rules

Accepted: Excel date cells and serial numbers, `yyyy-mm-dd`, `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`,
2-digit years, `yyyymmdd`, month names (English, Arabic, Levantine and Hijri month names), Arabic-Indic
digits, and a trailing هـ / م / AH marker. Day-first is assumed (GCC); a column is read month-first only
when its values can only be month-first (e.g. `03/25/2027`). **Years 1300–1599 are Hijri** and are
converted with the Umm al-Qura calendar (supported range 1343–1500 AH). Impossible dates (`31/02/2027`,
`1448/13/40`) are left empty with a warning and the original text is kept in additional data.

### Matching existing employees

A row matches an existing employee by **employee number**, otherwise by **Iqama / ID number**. If the
two identify different employees the row is rejected. With *Existing records → Update them* matched rows
are updated: only filled cells change stored values (blank cells never erase data) and additional data is
merged. Identity fields can only be changed by users with `personal_data.edit`.

### What is an error and what is a warning

| Row is **rejected** (error) | Field is **left empty** (warning, row imported) |
|---|---|
| missing name · duplicate employee number or Iqama in the file (later rows) · number and Iqama belong to different employees · a sub-record's employee not found · missing required value (leave type, relationship, document type…) | invalid date, e-mail, phone, gender or list value · unknown department/job title/location (unless created) · unknown manager · Iqama not 10 digits · Hijri/Gregorian mismatch · duplicate passport or e-mail |

Notes (blue) explain what will happen: Hijri converted, value will be created, existing record will be
updated or skipped, manager found later in the file.

Rows whose values equal the template's example row are skipped automatically. Footer rows such as
"الإجمالي / Total" and repeated header rows (printed exports) are ignored.

---

## 3. The import wizard

**Data management › New import** (or `…/admin/data-management?type=employees` from other pages):

1. **Data type** — employees, employee records (leave balances, dependents, insurance, documents
   metadata) or master data (departments, job titles, locations, cost centers, public holidays). Types
   you can't import are shown locked.
2. **Upload** — XLSX or CSV (UTF-8 or Windows-1256), up to 10 MB / 20,000 rows. The file is parsed once
   on the server and kept with the import until it finishes.
3. **Sheet & header** — the best-matching sheet and header row are pre-selected; the preview shows the
   first rows (click a row to use it as header).
4. **Column mapping** — suggestions with a confidence badge (Exact / Strong / Likely / Check / By values),
   manual override, *Keep as additional data* or *Don't import*. Required fields must be mapped.
5. **Review** — every row validated on the server against the rules and the existing data: totals, tabs
   Valid / Warnings / Errors / Skipped, per-row messages and a detail sheet (file values, values to import,
   additional data). Options (existing records, create missing master data, profession as job title, status
   of new employees, leave balance meaning and year) re-run the checks. *Download error report* gives an XLSX
   of every row with problems.
6. **Import** — rows are written in batches of 100 with progress; a lost connection can be resumed
   (history › *Continue*, or reload the page). The result lists created / updated / skipped / not imported,
   master data created and managers linked, with links to the imported records and the error report.

Each import is stored in `imports` (options, mapping, totals, result) and `import_rows` (original values,
normalized values, status, errors, warnings, created record). The audit trail gets `employee.import`
(employees) or `import.<type>` plus the usual row-level events.

**Who can import:** employees → `employees.create` (`employees.edit` to update); master data and holidays
→ `settings.edit`; leave balances → `leave.edit`; dependents → `personal_data.create/edit`; insurance →
`insurance.create/edit`; documents → `documents.create`. The database enforces the same rules (RLS).

### Other import types (templates)

| Type | Reference columns | Matching existing records |
|---|---|---|
| Departments | code, names, parent (code or name — may be later in the file), head (employee number or Iqama) | code, else name |
| Job titles · Locations · Cost centers | code, names (+ city, country) | code, else name |
| Public holidays | names, start date, end date (defaults to start) | start date + name |
| Leave balances | employee number or Iqama, leave type (code or name), year (default: chosen year), opening balance, entitlement | employee + leave type + year |
| Dependents | employee number or Iqama, dependent names, relationship, … | employee + dependent Iqama, else name |
| Insurance | employee number or Iqama, dependent name (optional), provider, policy, member number, dates, status | employee + member number (or policy + dependent) |
| Documents metadata | employee number or Iqama, document type, number, dates, status (derived from the expiry when empty) | employee + type + number |

Templates never contain internal IDs.

---

## 4. Templates, export hub and history

- **Templates** (`/api/data-management/templates/<type>[?lang=ar|en]`): a data sheet with localized
  headers (required columns in gold with notes), a grey example row, drop-down lists for list fields, a
  bilingual *Instructions* sheet (rules, every column with its format and accepted values) and a hidden
  *Lists* sheet. Arabic templates are right-to-left. Headers are recognized in either language.
- **Export data**: every dataset registered in `src/lib/export/registry.ts` that the user's permissions
  allow, with Excel / CSV / PDF downloads (`/api/export/<dataset>`). List pages export with their filters.
- **Import history**: filter by type, status and *With errors* (the *Error reports* card); details sheet
  with row results; continue unfinished imports; cancel uploaded/validated ones; export the history.
- **Error report** (`/api/data-management/imports/<id>/error-report`): rows with errors or warnings, the
  messages in the reader's language, the original values in the file's column order, and a summary sheet.

---

## 5. Backup package

**Administration › Backup & reset** (`settings.administer`) → *Download backup*
(`GET /api/backup`, streamed ZIP):

```
manifest.json            format, version, generated_at, generated_by, organization, includes_sensitive,
                         per-table row counts and file names
json/<table>.json        all rows, raw column names (restorable)
xlsx/<table>.xlsx        the same rows as a spreadsheet
```

Tables: organization, organization settings, system settings · employees, dependents, insurance,
documents metadata (+ compensation and bank accounts **only in a Super Admin's backup**) · departments,
job titles, locations, cost centers, public holidays · leave types, balances, adjustments, leave requests
· requests, request values, history, comments, approvals, attachments metadata · certificates metadata,
certificate templates and versions · request types, fields, workflows and steps, e-mail templates,
notification settings, roles and permissions. Uploaded files are not in the package (only their metadata).

Data is read with the signed-in user's permissions (RLS). Each download writes a `backup.export` audit
event; the backup history on the page is read from the audit trail.

## 6. Organization reset

Super Admin only. The page lists exactly what is deleted and what is kept (see
`public.reset_organization` in `docs/DATABASE.md` §14). The dialog requires:

1. acknowledging that a backup was downloaded (or downloading one from the dialog),
2. the Super Admin's password — verified server-side with a separate sign-in (`signInWithPassword`); a
   failed attempt is audited as `backup.reset_denied`,
3. typing `RESET ORGANIZATION`.

Then the server action runs `reset_organization` as the user (the RPC re-checks the role and the phrase
and audits `organization.reset`), removes every stored file of the organization with the service role
(`backup.reset_files`), clears the branding cache, signs the user out and sends them to
`/login?next=/setup`.

---

## 7. Implementation map

| Area | Files |
|---|---|
| Import core (pure TS) | `src/features/data-management/lib/` — `workbook.ts` (XLSX/CSV, header detection), `normalize.ts`, `values.ts` (dates/Hijri/numbers/…), `schemas.ts` (fields, synonyms, examples), `mapping.ts`, `context.ts`, `validate.ts`, `commit.ts`, `store.ts`, `analyze.ts`, `template.ts`, `error-report.ts`, `messages.ts` |
| App | `src/features/data-management/{actions.ts,permissions.ts,server/,components/}` · `src/app/(app)/admin/data-management/**` · `src/app/api/data-management/**` |
| CLIs | `scripts/analyze-workbook.ts`, `scripts/import-employees.ts` |
| Backup | `src/features/backup/**` · `src/app/(app)/admin/backup/**` · `src/app/api/backup/route.ts` |
| Database | `supabase/migrations/20260928100000_data_management.sql` — `import_sources` (parsed grid of an import in progress, RLS = `private.can_import()`, deleted when the import finishes) |
