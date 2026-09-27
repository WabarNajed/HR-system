# HR Portal

A bilingual internal HR portal for one organization per deployment: **Arabic first (RTL)** with a full
English (LTR) interface. Employees, managers and HR use it for employee records, HR requests and
approvals, leave, documents, certificates and reports. Everything specific to the organization
(name, logo, colours, structure, leave and request types, workflows, templates) is data the Super
Admin edits at runtime, not code.

Built with Next.js 16 and Supabase. Authorization is enforced in the database with Row Level
Security and checked again on the server.

## Features

- **Accounts and access:** e-mail sign-in, self-registration with HR approval (or an information
  request), admin invitations, password reset; five built-in roles (Super Admin, HR Admin, HR
  Officer, Manager, Employee) plus custom roles with a module × action permission matrix.
- **Employees:** a searchable directory, full profiles (employment, government IDs with Iqama and
  passport expiry, compensation and bank details, dependents, insurance, documents, leave, requests,
  certificates, activity), archiving, and a self-service profile.
- **HR Request Center:** 12 configurable request types with a form builder, subtypes and
  conditional fields; multi-step approval workflows (manager, HR, role or user steps) with return,
  reassign and SLA tracking in business days; comments, attachments, history; an approvals inbox.
- **Leave:** balances per leave type and year, working-day or calendar-day counting with public
  holidays, holds and deductions that are never applied twice, adjustments with an audit trail, and a
  team calendar.
- **Documents and expiry:** employee documents in private storage with short-lived signed links and
  expiry alerts (Iqama, passport, contract, insurance, documents).
- **Certificates:** versioned bilingual templates, PDF generation with correct Arabic shaping,
  company stamp and signature, and a public QR verification page.
- **Reports and exports:** 21 reports with filters, KPIs and charts, a simple report builder, and
  Excel / CSV / PDF exports that render Arabic correctly.
- **Notifications:** bilingual in-app notifications and branded e-mails (Resend or SMTP), with
  editable templates and an e-mail log.
- **Administration:** a settings console, branding with live preview, master data, a setup
  wizard, employee import from Excel, an append-only audit log, backup export, and an organization
  reset guarded by a typed confirmation.
- **Experience:** RTL/LTR layouts with logical CSS, light and dark themes, global search (⌘K),
  responsive layouts down to 390 px, skeleton loading states, and toast feedback on every action.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript (strict) |
| UI | Tailwind CSS v4, Radix primitives, lucide icons, TanStack Table, recharts, TipTap |
| i18n | next-intl (no locale in the URL; cookie → profile preference → organization default) |
| Data | Supabase: Postgres with RLS, Auth, private Storage (`@supabase/ssr`) |
| Documents | ExcelJS, Papa Parse, headless Chromium (puppeteer-core) for PDFs, qrcode |
| E-mail | Resend REST API or SMTP (nodemailer) |
| Tests | SQL test suite for RLS and RPCs (psql), Playwright end-to-end |
| Hosting | Vercel + Supabase |

## Architecture at a glance

```
Browser ──► Next.js (Vercel)
             ├─ proxy.ts            session refresh, sign-in redirect
             ├─ Server Components   reads with the user's RLS client
             ├─ Server Actions      zod validation → security-definer RPCs → i18n result keys
             └─ Route handlers      /api/export, /api/files (signed-URL redirects), /api/cron
                     │
                     ▼
           Supabase ── Postgres (RLS on every table, `private` helper schema, audit triggers)
                    ├─ Auth (e-mail/password, invitations, recovery)
                    └─ Storage (private buckets; public branding bucket)
```

- **Security in the database:** every table has RLS; multi-row changes (workflow steps, leave
  balances, registrations, roles) go through `security definer` RPCs that check the caller
  explicitly and write history, audit and notifications in one transaction. The UI hiding a control is
  never the protection.
- **Code layout:** `src/app` (routes), `src/features/<module>` (module components, queries, actions),
  `src/components/{ui,shared,data-table,shell}` (design system and app shell), `src/lib` (Supabase
  clients, guards, errors, e-mail, storage, PDF, export), `locales/{ar,en}` (messages),
  `supabase/migrations` (the only schema source).

## Quick start

Requirements: Node ≥ 20.9, pnpm 10, Docker and the Supabase CLI.

```bash
pnpm install
supabase start                                   # local Postgres/Auth/Storage; applies the migrations
cp .env.example .env.local                       # fill in the values from `supabase status`
node scripts/dev/seed-local-fixtures.mjs         # optional local QA users (password Passw0rd!Local)
pnpm dev                                         # http://localhost:3000
```

Details, environment variables, e-mail and PDF setup: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm check:i18n`, `pnpm db:test`, `pnpm e2e`, `pnpm build`.

## Deployment

Production runs on Vercel with a hosted Supabase project: push the migrations, set the environment
variables, bootstrap the first Super Admin (`pnpm bootstrap:super-admin --email …`) and complete the
setup wizard. Step by step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The engineering contract: stack, layout, data model, authorization, i18n, design system, routes |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, RLS matrix, RPC reference, workflow engine, leave state machine, error keys, tests |
| [docs/PRODUCT-SPEC.md](docs/PRODUCT-SPEC.md) | Product requirements and acceptance flows |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local development, scripts and checks |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying to Vercel and Supabase |
| [docs/DATA-IMPORT.md](docs/DATA-IMPORT.md) | Importing employees and master data from Excel |
| [e2e/README.md](e2e/README.md) | End-to-end tests |
| [scripts/dev/README.md](scripts/dev/README.md) | Local QA fixtures |
| [CLAUDE.md](CLAUDE.md) | Working rules for contributors and coding agents |
