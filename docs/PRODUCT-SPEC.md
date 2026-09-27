# HR Portal — Product Specification

Condensed from the master product brief. All lists are authoritative. See `ARCHITECTURE.md` for how
each item maps to code and data.

## 0. Quality bar
Real premium enterprise HR SaaS (benchmark: mature Saudi/GCC HR suites such as Jisr — quality only,
never copy brand/layout/colors/assets). Professional, modern, dynamic, corporate, elegant, compact,
fast, operational. **Rejected**: huge blank spaces, tiny typography, weak hierarchy, thin empty cards,
static feel, unfinished tables, placeholder pages, poor settings UX, dead controls, hanging clicks,
inefficient desktop use, fake data. Works on desktop (1440×900, 1920×1080), tablet, mobile (390×844 —
intentional mobile UX, not shrunk desktop). Dark mode designed properly if supported.

## 1. Roles
* **Super Admin** — controls everything: organization, branding, users, roles, permissions, departments,
  job titles, locations, cost centers, leave types, public holidays, request types, form builder,
  approval workflows, SLA, document/certificate/email templates, notifications, security, imports,
  exports, audit logs, backup, organization reset. Dedicated polished control center.
  Bootstrap: user provides email → create/link Supabase Auth user → link profile → assign
  `super_admin` → status active → password via secure invitation/reset flow. Existing user is
  promoted safely. No hardcoded or committed credentials.
* **HR Admin** — manage employees, approve registrations, requests, leave, documents, certificates,
  dependents, insurance; run reports; import/export; manage permitted HR settings. Cannot remove Super
  Admin ownership.
* **HR Officer** — operational HR per permissions; cannot change critical ownership/security.
* **Manager** — view direct reports, assigned approvals; approve/reject/return; comment; team leave
  calendar. Must NOT automatically see salary, bank, medical info, private HR comments, sensitive docs.
* **Employee** — own profile, leave, requests, documents, certificates; submit requests; upload
  permitted files; update permitted profile fields; notifications; change password. Never sees another
  employee's private data.

## 2. Authentication
Pages: Sign In, Register, Forgot Password, Reset Password, Pending Approval, Account Disabled.
Employee record and Auth account are separate: an employee may have no portal access. HR can invite,
create portal access, link/unlink user, enable/disable login, resend invitation.
**Self registration**: Employee ID, Full Name, Email, Mobile, Password → system tries to match Employee
ID (also accept Iqama/National ID when the org has no employee numbers) → account `Pending Approval`
(no protected pages). HR can Approve / Reject / Request Information. Approval → link employee, assign
`employee` role, activate, audit event, notification (+ email).

## 3. Organization settings (Settings › Organization)
Company Name AR/EN, Legal Name AR/EN, Logo, Address AR/EN, City, Country, Website, Phone, HR Email,
Commercial Registration, VAT Number, Currency, Timezone, Default Language, Working Days, Weekend
Days, Working Hours, Fiscal Year. Groups: Identity · Contact · Legal · Regional Settings · Working
Schedule. 2-column desktop, sticky Cancel/Save.

## 4. Branding
Portal Name AR/EN, Company Logo, Primary Color, Secondary Color, Company Stamp, Authorized Signature,
Login Page Branding. Left: controls; right: live preview.

## 5. Employee master
* Identity/contact: Employee ID, Arabic Name, English Name, Company Email, Personal Email, Mobile,
  Alternative Mobile, Gender, Nationality, DOB, Marital Status.
* Employment: Department, Division, Section, Job Title, Grade, Manager, Employment Type, Employment
  Status, Joining Date, Probation End, Contract Start, Contract End, Location, Cost Center.
* Government: National ID / Iqama, Iqama Issue, Iqama Expiry, Hijri Iqama Expiry, Passport Number,
  Passport Expiry, Employer Number, Outside Kingdom.
* Bank: Bank Name, IBAN, Account Holder.
* Insurance: Provider, Policy, Class, Member Number, Start Date, Expiry.
* Emergency contact: Name, Relationship, Mobile.
* System: Account Status, Portal User, Role, Created, Updated.
* **Profile** tabs: Overview, Employment, Personal, Leave, Documents, Requests, Certificates,
  Dependents, Insurance, Activity. Header: avatar, name, employee ID, job title, department,
  employment status; actions Edit, New Request, Upload Document, More. Structured cards — no giant plain
  forms.
* **Directory**: header "Employees" with Add Employee / Import / Export; filters Search, Department,
  Status, Manager, Location, More Filters; columns Employee, Employee ID, Job Title, Department, Manager,
  Status, Iqama Expiry, Actions; row click → profile.

## 6. Initial dataset — workbook `Book1(6).xlsx`
Must be inspected before import: detect sheets, columns, record count, duplicates, invalid dates,
missing values, invalid emails, duplicate Iqamas; map fields intelligently. Known columns: Iqama
Number, Employee Name, Gender, Nationality, Profession / Job Title, Passport Number, Passport Expiry,
Iqama Issue Date, Iqama Expiry, Date of Birth, Outside Kingdom Status, Hijri Iqama Expiry, Employer
Number, Email, Leave Balance. Preserve all meaningful information; never invent data; blank email →
NULL; preserve Arabic names exactly; do NOT create login accounts for imported employees. Imported
employees appear immediately in Employees, Search, Dashboard stats, Leave, Iqama and Passport reports.
(The workbook was not provided to the build environment — the import pipeline + `pnpm analyze:workbook`
are built for it; see `DATA-IMPORT.md`.)

## 7. Import / export / templates
* Import (Administration › Data Management › Import): XLSX + CSV. Upload → Parse → Validate → Preview →
  Confirm → Import. Show Total / Valid / Warnings / Errors. Detect duplicate Employee ID, duplicate Iqama,
  invalid email, invalid date, missing name, unknown department, unknown manager. Download Error Report.
* Downloadable XLSX templates (human-readable, no UUIDs): Employees, Departments, Job Titles, Locations,
  Cost Centers, Leave Balances, Dependents, Insurance, Employee Documents Metadata, Public Holidays.
* Export (authorized HR): Employees, Requests, Leave Balances, Documents Metadata, Dependents,
  Insurance, Certificates, Users — Excel, CSV, PDF where applicable; apply current filters.
* Data Management UI cards: Import Employees, Import Master Data, Export Data, Download Templates,
  Import History, Error Reports.

## 8. HR Request Center
Numbering `HR-YYYY-000001`. Statuses: Draft, Submitted, Pending Manager Approval, Pending HR Review,
Returned for Information, Approved, Rejected, In Progress, Completed, Cancelled.
Default request types (each with its subtypes and ONLY relevant fields shown):
1. **Leave Request** — Leave types: Annual, Sick, Emergency, Unpaid, Marriage, Maternity, Paternity,
   Bereavement, Hajj, Exam, Other. Fields: Leave Type, Start Date, End Date, Return Date, Requested Days
   (calculated), Reason, Emergency Contact, Attachment.
2. **Certificate Request** — Salary Certificate, Employment Certificate, Salary & Employment
   Certificate, Experience Certificate, Custom Certificate. Fields: Language (Arabic / English / Arabic &
   English), Addressed To, Purpose, Include Salary, Include Allowances, Comments.
3. **Iqama & Visa** — Iqama Renewal, Dependent Iqama Renewal, Exit Re-Entry, Multiple Exit Re-Entry,
   Final Exit, Passport Update, Profession Update, Other. Dynamic relevant fields.
4. **Medical Insurance** — Insurance Card Issue, Coverage Issue, Hospital/Clinic Issue, Claim Issue,
   Approval Issue, Add Dependent, Remove Dependent, Update Dependent, New Employee Enrollment, Other.
   Fields: Insurance For, Dependent, Provider, Claim Number, Issue Description, Attachments.
5. **Payroll Issue** — Salary Not Received, Incorrect Salary, Incorrect Deduction, Missing Allowance,
   Overtime Payment Issue, Bonus Issue, End of Service Issue, Other. Fields: Payroll Month, Amount,
   Description, Attachment.
6. **Attendance & Time** — Missing Check-In, Missing Check-Out, Incorrect Check-In, Incorrect Check-Out,
   Late Arrival, Early Departure, Attendance Correction, Remote Work Request, Other. Fields: Date,
   Check-In, Check-Out, Reason, Attachment.
7. **Bank Account Update** — Bank Name, IBAN, Account Holder, IBAN Certificate. Employee bank data is
   updated only after approval.
8. **Employee Information Update** — Mobile, Email, Address, Marital Status, Emergency Contact, Passport,
   Dependent, Other. Store Current Value, Requested Value, Reason, Attachment. Apply only after approval.
9. **Overtime** — Date, Start Time, End Time, Hours, Reason, Manager, Attachment.
10. **Business Trip** — Destination, Country, Start Date, End Date, Purpose, Cost Center, Transport
    Required, Hotel Required, Flight Required, Advance Required, Advance Amount, Notes.
11. **Resignation** — Submission Date, Proposed Last Working Day, Reason (Career Opportunity, Personal,
    Relocation, Education, Compensation, Work Environment, Retirement, Other), Comments, Attachment.
12. **Other HR Request**.

Dynamic form field types: Short Text, Long Text, Number, Currency, Date, Date & Time, Dropdown, Multi
Select, Yes/No, Attachment.

**Request Type builder** (Settings › Request Types): create, edit, duplicate, activate, deactivate;
Arabic/English name & description, icon, SLA, manager approval required, HR approval required.
**Form builder**: per field Arabic/English label, required, help text AR/EN, options, order, visibility
rules; drag reorder; preview. UI: left request types · center fields · right properties.

**Approval engine** default workflows: Leave, Overtime, Business Trip: Employee → Manager → HR.
Certificate, Medical Insurance, Payroll: Employee → HR. Actions: Approve, Reject, Return for
Information, Reassign, Mark In Progress, Complete, Cancel. Every action persists, updates status,
creates history, audit event, notification. **Workflow builder**: visual nodes (Employee Submission →
Manager Approval → HR Review → Completed), per request type.

**Request details**: Request Number, Employee, Department, Request Type, Status, Created Date, SLA,
Request Data, Attachments, Comments, Approval History, Timeline. Split layout: header (request,
employee, status, SLA); main (details, attachments, comments); side (workflow, assigned HR, actions);
bottom timeline.
**Return for information**: employee notified; can open, edit allowed fields, comment, upload more,
resubmit; workflow resumes properly.
**Comments**: employee-visible vs internal HR (employees never see internal).
**SLA**: per request type, business days (org working days + public holidays). Display On Track / Due
Soon / Overdue.

**Request Center UI**: tabs All, Pending, In Progress, Completed, Rejected; filters Search, Request
Type, Employee, Department, Status, Assigned HR, SLA, Date; columns Request #, Employee, Type, Created,
Workflow Step, Status, Assigned, SLA, Actions.
**New Request UX**: 3 steps — Type (selectable cards) → Details (dynamic form) → Review.
**Approvals UI**: tabs Pending, Approved, Rejected; fast filters; quick actions.

## 9. Leave management
Balance: Opening Balance, Entitlement, Adjustment, Approved Used, Pending, Remaining = Opening +
Entitlement + Adjustment − Approved Used. Adjustments require Amount + Reason; store old balance, new
balance, changed by/at. Effects: submission → +Pending; approval → Pending→Used; rejection → reverse
Pending; cancellation after approval → reverse Used safely; never double-deduct. Public holidays
(Arabic name, English name, start, end) used in calculations. Leave calendar: employee own, manager
direct reports, HR org — never show confidential reason in shared calendar. Leave UI tabs: Requests,
Balances, Calendar, Leave Types, Public Holidays + summary cards.

## 10. Dependents
Arabic Name, English Name, Relationship, DOB, Nationality, ID/Iqama, Iqama Expiry, Passport, Passport
Expiry, Insurance Status, Insurance Member Number, Notes.

## 11. Employee documents & expiry
Types: Employment Contract, National ID, Iqama, Passport, Medical Insurance, IBAN Certificate,
Educational Certificate, Professional Certificate, Medical Report, Visa, Signed HR Form, Other. Fields:
Employee, Document Type, Document Number, Issue Date, Expiry Date, Status, Attachment, Notes.
Expiry buckets: Expired, Within 7/14/30/60/90 days. Monitor Iqama, Passport, Contract, Insurance,
Documents. Document Center UI: cards Expiring Soon, Expired, Missing, Uploaded; table Employee,
Document, Number, Expiry, Status, Actions.

## 12. Certificates
Template builder (Administration › Document Templates): Salary, Employment, Salary & Employment,
Experience, Custom HR Letter; edit wording without code. Editor supports Arabic content, English
content, header, footer, logo, recipient, date, signature, stamp; rich editing; RTL Arabic / LTR
English. UI: left template settings · center editor · right variables · top Preview / Save / Publish.
Variables: `{{employee_name_ar}} {{employee_name_en}} {{employee_id}} {{job_title_ar}} {{job_title_en}}
{{department_ar}} {{department_en}} {{joining_date}} {{basic_salary}} {{housing_allowance}}
{{transport_allowance}} {{other_allowance}} {{total_salary}} {{company_name_ar}} {{company_name_en}}
{{company_address_ar}} {{company_address_en}} {{current_date}} {{addressed_to}} {{certificate_number}}`.
Version history on every edit (version, changed by/at, change notes) with restore. Variants e.g. Salary
Certificate – General / Bank / Embassy / Arabic / English. PDF: professional, Arabic + English, RTL/LTR,
logo, stamp, signature; number `CERT-YYYY-000001`; stored privately. HR workflow: open certificate
request → select template → language → recipient → preview → generate PDF → save → download → complete
request. Employee downloads authorized certificates. Optional QR → public `/verify/[certificate-number]`
showing ONLY certificate number, employee name, certificate type, issue date, status (never salary,
employee ID, Iqama, passport, bank or other sensitive data). Certificate Center UI: tabs Requests,
Issued, Templates; table Certificate #, Employee, Type, Language, Date, Status, Actions.

## 13. Reports
Employee Master, Headcount, Employees by Department, by Nationality, by Job Title, New Joiners,
Leavers, Contract Expiry, Iqama Expiry, Passport Expiry, Insurance Expiry, Leave Balance, Leave Usage,
HR Requests, Open Requests, Completed Requests, Rejected Requests, Overdue Requests, SLA Performance,
Certificates Issued, User Activity. Filters (must affect data): Date Range, Employee, Department,
Manager, Location, Nationality, Request Type, Status. Export Excel/CSV/PDF (Arabic correct). Groups:
Employees, Leave, Requests, Compliance, Certificates, Audit; each report: filters, KPIs, table, export.
Simple custom report builder: data source, columns, filters, sorting, date range, preview, export.

## 14. Notifications & email
In-app events: Request Submitted, Approval Required, Approved, Rejected, Returned, Assigned, Completed,
Expiry Alert, Registration Approval. Unread/read, mark read, mark all read; click opens record.
Email (Resend or configurable SMTP): Account Invitation, Registration Submitted/Approved/Rejected,
Password Reset, Request Submitted, Approval Required, Approved, Rejected, Returned, Completed, Iqama /
Passport / Insurance / Contract / Document Expiry. Email template editor: Arabic/English subject and
body; placeholders `{{employee_name}} {{manager_name}} {{request_number}} {{request_type}}
{{request_status}} {{company_name}}`. Email log: recipient, subject, type, related record, status,
sent at, failure reason.

## 15. Audit, backup, reset, setup, search
* Audit (read-only): login, logout, user approval, role change, employee create/edit/archive/import,
  request create/update, approval, rejection, completion, leave adjustment, document upload,
  certificate generation, template edit, settings change, import, export, backup, reset. UI: dense
  table, filters, details drawer.
* Backup export package: organization settings, employees, departments, job titles, locations, leave,
  requests, dependents, documents metadata, certificates metadata, request configuration, templates.
* Organization reset: super admin only; re-authentication; backup recommendation; type
  `RESET ORGANIZATION`; never delete source code or the Super Admin owner account.
* Setup wizard (fresh setup): Organization, Branding, Departments, Job Titles, Locations, Leave Types,
  Request Types, Approval Workflows, HR Admin, Email, Employee Import.
* Global search: employee name, employee ID, Iqama, request number, certificate number — respecting
  permissions.

## 16. UI structure
* Shell: collapsible sidebar (240–270px expanded / 64–72px collapsed; right side in Arabic, left in
  English), compact header (breadcrumb, global search, New Request, notifications, language, profile;
  HR/Admin also Add Employee).
* Sidebar groups: Home (Dashboard) · People (Employees) · Operations (Requests, Approvals, Leave) ·
  Services (Documents, Certificates) · Insights (Reports) · Administration (Settings, Audit Log). Hide
  unauthorized items.
* Role dashboards —
  Employee: Leave Balance, Open Requests, Documents Expiring, Certificates; quick actions Request Leave,
  Request Certificate, New HR Request; Recent Requests, Upcoming Leave, Notifications.
  Manager: Pending Approvals, Direct Reports, Team on Leave, Upcoming Leave; Approval Queue, Team Leave
  Calendar, Team Requests.
  HR: Total Employees, Pending Requests, Pending Approvals, Employees on Leave, Overdue Requests;
  Compliance (Iqama, Passport, Contract, Insurance); Request Queue, Expiry Alerts, Employee Overview,
  Recent Activity.
  Super Admin: Organization Health, Users, Roles, Pending Registrations, Configuration Issues, Imports,
  Audit Activity.
* Settings console navigation — GENERAL: Organization, Branding · PEOPLE & ACCESS: Users, Roles &
  Permissions, Pending Registrations · HR SETUP: Departments, Job Titles, Locations, Cost Centers ·
  LEAVE: Leave Types, Public Holidays · REQUESTS: Request Types, Form Builder, Approval Workflows, SLA ·
  DOCUMENTS: Document Templates, Certificate Templates · COMMUNICATION: Email Templates, Notifications ·
  SYSTEM: Security, Data Management, Audit Log, Backup & Reset. Settings home = grouped cards
  (Organization, Branding, Users & Access, HR Structure, Request Management, Leave Management,
  Documents, Data Management, Security & Audit).
* Users UI table: User, Email, Employee, Role, Status, Last Login, Actions. Roles UI: permissions
  matrix — modules Employees, Personal Data, Bank, Insurance, Documents, Requests, Approvals, Leave,
  Certificates, Reports, Settings, Audit, Users × View, Create, Edit, Approve, Export, Administer.
* Master data pattern (Departments, Job Titles, Locations, Cost Centers, Leave Types, Public Holidays):
  header, add, search, filters, table, actions, import, export.
* Tables standard: search, filters, sorting, pagination, column visibility, export, row actions,
  loading skeleton, empty state. Forms: sections, logical grouping, 2-col desktop / 1-col mobile, inline
  validation, descriptions, save/cancel. Drawers for quick edit/filters/details preview; dialogs for
  approve/reject/archive/delete/dangerous actions.
* Errors never expose raw DB errors (ar: `تعذر تنفيذ العملية. حاول مرة أخرى.` en: `Unable to complete
  the operation. Please try again.`).
* Accessibility: semantic controls, labels, keyboard support, focus states, ESC closes dialogs, contrast.

## 17. Acceptance (E2E flows)
Employee: login → new request → submit → view. Manager: login → approvals → approve. HR: login → review
→ complete. Return: return → employee edit → resubmit. Leave: submit → manager → HR → balance →
calendar. Certificate: request → template → PDF → download → QR verify. Import: download template →
upload → validate → import. Report: open → filter → export. Language: Arabic → English → Arabic (all
routes RTL/LTR correct; no untranslated system labels).
