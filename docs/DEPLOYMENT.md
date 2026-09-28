# Deployment guide

Production topology: **Vercel** (Next.js app, API routes, daily cron) + **Supabase** (Postgres with RLS,
Auth, private Storage) + **Resend** or any SMTP server for email. No other paid services are required.

---

## 1. Costs and cheaper alternatives

| Service | Plan | Cost | Notes |
|---|---|---|---|
| Supabase | Free | $0 | 500 MB database, 1 GB storage, 50k monthly active users. **Free projects pause after 7 days without activity** and have no automatic backups — fine for a pilot. |
| Supabase | Pro | $25 / month | Recommended for production: no pausing, daily backups, 8 GB DB, 100 GB storage. |
| Vercel | Hobby | $0 | Personal / non-commercial use only per Vercel's terms. Daily cron supported. |
| Vercel | Pro | $20 / user / month | Required for commercial use by a company. |
| Resend | Free | $0 | 3,000 emails / month, 100 / day, one verified domain. |
| SMTP (alternative) | — | often $0 | Any SMTP relay (e.g. the company's existing mail server, Amazon SES ≈ $0.10 per 1,000 emails). Configure `SMTP_*` instead of `RESEND_API_KEY`. |

PDF generation runs headless Chromium inside a Vercel function (`@sparticuz/chromium`) — no paid PDF
API. If you prefer not to use Vercel Pro, the app also runs on any Node 20+ host (`pnpm build && pnpm start`,
e.g. a small VPS or Railway/Render); set `CHROMIUM_EXECUTABLE_PATH` to a local Chromium there.

---

## 2. Supabase project

1. Create a project at <https://supabase.com> (region close to users, e.g. `eu-central-1` / Frankfurt or
   `me-central-1` when available). Save the database password.
2. Apply the schema (all tables, RLS, RPCs, storage buckets & policies, default configuration seeds):
   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <project-ref>
   pnpm dlx supabase db push          # applies supabase/migrations/* in order
   ```
   Alternative without the CLI: paste each file of `supabase/migrations/` into the SQL editor **in file-name
   order**.
3. **Authentication → URL configuration**
   * Site URL: `https://<your-domain>`
   * Redirect URLs: `https://<your-domain>/auth/callback`, `https://<your-domain>/auth/confirm`,
     `https://<your-domain>/**`
4. **Authentication → Providers → Email**: enable email sign-in; keep "Confirm email" ON for production
   self-registration (users confirm, then wait for HR approval).
5. **Authentication → Emails → SMTP settings** (so invitations and password resets come from your domain):
   with Resend use host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key,
   sender = `hr@<your-domain>`. Update the invite / recovery email templates so their links point to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password` (invite) and
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` (recovery).
6. Storage buckets (`employee-documents`, `request-attachments`, `certificate-files` private; `branding`
   public) are created by the migrations — nothing to click.
7. **Settings → JWT Keys: use asymmetric signing keys (ECC P-256 / RS256).** New projects have them by
   default; a project still on the *legacy JWT secret* (HS256) should migrate (create a standby ECC key,
   rotate to it, keep the legacy secret as a verification-only key until old sessions expire). With
   asymmetric keys `auth.getClaims()` verifies sessions locally against the cached JWKS; with the legacy
   HS256 secret every verification is a network round trip to Supabase Auth (`/auth/v1/user`,
   ~100–600 ms under load). The proxy verifies once per request and hands the result to the session
   loader in a signed, token-bound header (`src/lib/auth/verified-claims.ts`, keyed by the service-role
   key), so a render costs at most one verification either way — but each prefetch and navigation still
   pays it on HS256. Never put the legacy JWT secret into the app's environment.
8. Copy **Project URL**, **anon public key** and **service_role key** (Settings → API).

---

## 3. Vercel project

1. Import the Git repository in Vercel (framework preset: Next.js, package manager pnpm).
2. Environment variables (Production + Preview):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**server only — never expose**) |
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-domain>` (used in emails and certificate QR codes) |
   | `RESEND_API_KEY` | Resend API key — or leave empty and set the `SMTP_*` variables |
   | `EMAIL_FROM` | e.g. `HR Portal <hr@<your-domain>>` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | only when using SMTP |
   | `CRON_SECRET` | a long random string (Vercel sends it to the cron route) |
   | `SUPER_ADMIN_EMAIL` | optional, used by the bootstrap script only |

3. Deploy. `vercel.json` registers the daily expiry-alert cron (`/api/cron/expiry-alerts`).
4. PDF routes use Chromium: if a certificate/report PDF times out on the Hobby plan, raise the function
   memory/duration in the Vercel project settings (Pro) or generate fewer pages per export.

---

## 4. First run

1. **Bootstrap the Super Admin** (from a trusted machine with the production env vars in `.env.local`):
   ```bash
   pnpm install
   pnpm bootstrap:super-admin --email owner@company.com
   ```
   The script creates or links the Auth user, activates the profile, assigns `super_admin`, writes an audit
   event and sends a Supabase invitation (password is set by the owner through the secure link — no
   password is ever stored in code or git). Running it for an existing user promotes that user safely.
2. Sign in and complete the **Setup wizard** (`/setup`): organization, branding, departments, job titles,
   locations, leave types, request types, approval workflows, HR admin invitation, email test, employee
   import.
3. **Import employees**: Administration → Data Management → Import (XLSX/CSV), or from the command line:
   ```bash
   pnpm analyze:workbook "Book1(6).xlsx"          # inspection report: sheets, columns, duplicates, invalid values
   pnpm import:employees "Book1(6).xlsx" --dry-run
   pnpm import:employees "Book1(6).xlsx"
   ```
   See `docs/DATA-IMPORT.md` for the column mapping and rules. Imported employees do **not** get login
   accounts — invite them from the employee profile or let them self-register.

---

## 5. Operations

* **Backups**: Supabase Pro takes daily backups. Additionally, Administration → Backup exports a ZIP
  (JSON + XLSX per entity) on demand.
* **Schema changes**: add a new file to `supabase/migrations/`, run `pnpm db:test` locally, then
  `supabase db push`.
* **Security**: all authorization is enforced by Postgres RLS and security-definer RPCs; the service-role
  key is used only server-side for Auth administration, bootstrap, and organization reset.
* **Moving to another organization**: Super Admin → Backup & Reset → *Reset organization* (requires
  re-authentication and typing `RESET ORGANIZATION`), then run the setup wizard again.
