# scripts/dev — local-only QA helpers

These scripts create **QA data for local development and browser testing**. That data is not product
data: it is never needed in production, and it must never reach a hosted project.

## `seed-local-fixtures.mjs`

```bash
node scripts/dev/seed-local-fixtures.mjs            # create / refresh the fixtures (idempotent)
node scripts/dev/seed-local-fixtures.mjs --verify   # …then sign in as every user and print how many employee rows RLS returns
```

- **Refuses to run** unless `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) points at `localhost`, `127.0.0.1` or `::1`.
- Reads `.env.local` for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
- **Password:** `LOCAL_FIXTURE_PASSWORD`, default `Passw0rd!Local`. It is a public test value that only works against your local stack.
- Creates users through the GoTrue admin API. Everything else goes through PostgREST with the local service-role key: master data, employees, compensation, bank accounts, leave balances, roles and profile status.
- **Safe to re-run:** it upserts by e-mail, code and employee number, and resets each user's password and roles to the table below.

| User | Roles | Status | Employee |
|---|---|---|---|
| superadmin@hr.local | super_admin | active | — |
| hradmin@hr.local | hr_admin, employee | active | QA-0001 |
| hrofficer@hr.local | hr_officer, employee | active | QA-0002 |
| manager@hr.local | manager, employee | active | QA-0003 (manages QA-0004 and QA-0005) |
| employee@hr.local | employee | active | QA-0004 |
| employee2@hr.local | employee | active | QA-0005 |
| pending@hr.local | — | pending (self sign-up; registration number QA-0006 → matched suggestion) | — |
| disabled@hr.local | employee | disabled | — |

- **QA master data:** 2 departments, 4 job titles, 1 location and 1 cost center. Every name starts with `QA` and every code with `QA-`.
- **Employees:** `QA-0001`…`QA-0006`, with Iqama, passport and contract expiry dates spread across the expiry buckets (expired, 7/14/30/60/90 days, valid) so the dashboards and reports have something to show.
- **Compensation and bank:** every QA employee gets a compensation row and a primary bank account.
- **Leave balances:** created for the current year, for each deducting leave type.
- **Not touched:** the organization profile and setup wizard state, and the request, leave and document history.

**Expected `--verify` result:**

| User | Employee rows |
|---|---|
| super admin, HR admin, HR officer | all 6 |
| manager | 3 (self and 2 reports) |
| employee, employee2 | 1 |
| pending, disabled | 0 |

**Starting from a clean database:** reset the local stack, which re-applies the migrations and removes all data, then run the script again.
