# Local development

How to run the HR Portal on your machine with the official Supabase CLI, and how to check your work
before opening a pull request. Architecture and conventions: `docs/ARCHITECTURE.md` (binding) and
`CLAUDE.md`. Database details: `docs/DATABASE.md`. Production: `docs/DEPLOYMENT.md`.

## Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | ≥ 20.9 (22 LTS recommended) | Next.js 16, scripts |
| pnpm | 10 (`corepack enable`) | package manager (the only one supported) |
| Docker | a recent Docker Desktop / Engine | runs the local Supabase stack |
| Supabase CLI | 2.x (`brew install supabase/tap/supabase`, or `npx supabase`) | `supabase start`, migrations |
| psql | 15+ client | `pnpm db:types`, `pnpm db:test` |
| Chrome / Chromium | any recent | PDF rendering (certificates, PDF exports) and `pnpm e2e` |

## First-time setup

```bash
pnpm install
supabase start                 # Postgres, Auth, Storage, REST, Studio and the mail catcher in Docker
```

`supabase start` applies every file in `supabase/migrations/` to the new database. The migrations
also seed the default configuration (roles and permissions, leave and request types, workflows,
certificate and e-mail templates), so there is no `seed.sql`.

Create `.env.local` from `.env.example` with the values printed by `supabase status`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase status`>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from `supabase status`>   # server only
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres   # scripts only
EMAIL_FROM="HR Portal <hr@portal.local>"
SMTP_HOST=127.0.0.1
SMTP_PORT=54325
SMTP_SECURE=false
CHROMIUM_EXECUTABLE_PATH=/path/to/chrome                              # PDF rendering
CRON_SECRET=any-local-value
```

`.env.local` is git-ignored; never commit keys. Every variable is described in `.env.example` and
ARCHITECTURE §10.

Then create an account to sign in with:

```bash
# Option 1 — QA fixtures (local only): 8 users in every role + sample employees, password Passw0rd!Local
node scripts/dev/seed-local-fixtures.mjs --verify

# Option 2 — a real first Super Admin (the production path): invite link goes to the mail catcher
pnpm bootstrap:super-admin --email you@example.com
```

```bash
pnpm dev                       # http://localhost:3000
```

The fixtures are described in `scripts/dev/README.md` (`superadmin@hr.local`, `hradmin@hr.local`,
`hrofficer@hr.local`, `manager@hr.local`, `employee@hr.local`, `employee2@hr.local`, `pending@hr.local`,
`disabled@hr.local`). The script refuses to run against a non-local Supabase URL.

## Local services

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase API (REST, Auth, Storage) | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | http://127.0.0.1:54323 |
| Mail catcher (Inbucket / Mailpit) | http://127.0.0.1:54324 (SMTP on 54325) |

All e-mail stays local: Supabase Auth mail (invitations, password resets, sign-up confirmations) and
the app's own notification e-mails (SMTP settings above) land in the mail catcher. With neither
`RESEND_API_KEY` nor `SMTP_HOST` set, the app records e-mails in `email_logs` as `skipped`.

`supabase/config.toml` turns on e-mail confirmation for self sign-up, like a hosted project: confirm
new registrations from the mail catcher.

## Database workflow

The migrations are the only source of the schema (DATABASE.md §18).

```bash
supabase migration new <name>  # creates supabase/migrations/<timestamp>_<name>.sql
supabase migration up          # applies pending migrations to the running local database
supabase db reset              # drops the local database and re-applies every migration (all data lost)
pnpm db:types                  # regenerates src/types/database.ts from the live schema (never hand-edit it)
pnpm db:test                   # database test suite: RLS, RPCs, workflow, leave maths, storage policies
```

- Write migrations idempotently (`create or replace`, `if not exists`, `drop policy if exists`). Every
  new table gets RLS and policies; every new function gets `set search_path = ''` and an explicit
  `revoke execute … from public, anon` unless it is meant to be public.
- After `supabase db reset`, run `node scripts/dev/seed-local-fixtures.mjs` again.
- `pnpm db:test` runs each `supabase/tests/NN_*.sql` file in a transaction that is rolled back, so it
  leaves no data behind and also passes on a database that holds the fixtures.
- `pnpm db:types --check` fails when `src/types/database.ts` is stale (use it in CI).

## Checks

Run these before pushing; CI runs the same commands.

```bash
pnpm typecheck                 # tsc --noEmit (strict)
pnpm lint                      # eslint, including the logical-CSS rule (no ml-/pr-/left-… classes)
pnpm check:i18n                # ar/en key parity, placeholders, no hard-coded UI strings
pnpm db:test                   # database tests (needs the local stack)
pnpm e2e                       # Playwright, against the running app (see e2e/README.md)
pnpm build                     # production build
```

`pnpm check:i18n` scans `src/**/*.tsx` for literal text; opt a line out with `// i18n-ignore` only for
brand-neutral symbols. It also checks **client message coverage**: the browser only receives the
namespaces in `ROOT_CLIENT_NAMESPACES` (root layout) plus those a route layout adds with
`<ClientMessages ns={[…]}>` (`src/lib/i18n/client-namespaces.ts`, `client-messages.tsx`) — the full
catalog is ~340 KB in Arabic. A Client Component that calls `useTranslations('x')` on a route that does
not provide `x` fails the check; `node scripts/check-i18n.mjs --client-usage` lists what each route
group/section uses on the client. Server Components are unaffected (`getTranslations` sees everything).

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next.js dev server on port 3000 (Turbopack) |
| `pnpm build` / `pnpm start` | production build / serve it |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:i18n` | static checks |
| `pnpm db:types` | regenerate `src/types/database.ts` (`--check` for drift) |
| `pnpm db:test` | `bash supabase/tests/run.sh` (optionally pass test files) |
| `pnpm e2e` | Playwright end-to-end tests |
| `pnpm bootstrap:super-admin --email <addr>` | create or promote the first Super Admin and send an invitation (service role; idempotent) |
| `pnpm analyze:workbook <file.xlsx>` | profile an HR workbook before importing it (docs/DATA-IMPORT.md) |
| `pnpm import:employees <file.xlsx>` | command-line employee import (docs/DATA-IMPORT.md) |
| `node scripts/dev/seed-local-fixtures.mjs [--verify]` | local QA users and data (never on a hosted project) |

## Working conventions

- Arabic first: every user-facing string lives in `locales/{ar,en}/<namespace>.json` with identical
  keys; dates via `useDateFormat()` / `formatDate()`; logical CSS only. A namespace used by a Client
  Component must be sent to its route (`ClientMessages`, see Checks).
- Security headers (CSP, `X-Frame-Options`, HSTS in production, …) are set in `next.config.ts`
  (`headers()`). A new browser-side origin (a CDN, an analytics endpoint) needs a CSP entry there.
- Reads in Server Components with the user's RLS client; mutations in Server Actions
  (`withAction`, zod, `ActionResult` with i18n keys); DB and Auth errors through `lib/errors.ts`.
- Authorization lives in the database (RLS, security-definer RPCs) and in server guards
  (`requireAccess(ROUTE_ACCESS[...])`); the sidebar only hides.
- The service-role client (`lib/supabase/admin.ts`) is server-only and used after an explicit role
  check for Auth admin work.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Configuration required" screen | `.env.local` is missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; restart `pnpm dev` after editing it. |
| Sign-in works but pages show "service unavailable" | the Supabase stack is down: `supabase status`, then `supabase start`. |
| A new column or RPC is "not found in the schema cache" | the migration is not applied: `supabase migration up` (PostgREST reloads automatically). |
| Type errors after a schema change | `pnpm db:types`. |
| Registration e-mail never arrives | open the mail catcher at :54324; confirmations are on (`[auth.email] enable_confirmations`). |
| PDF export fails locally | set `CHROMIUM_EXECUTABLE_PATH` to a Chrome/Chromium binary. |
| Sign-in rate limited during E2E runs | the CLI allows 30 sign-ins per 5 minutes per IP (`[auth.rate_limit]`); wait, or raise it locally. |
