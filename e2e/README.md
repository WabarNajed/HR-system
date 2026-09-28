# End-to-end tests (Playwright)

Browser tests that drive the real app against a real Supabase stack. They never start a server:
run the app first, then `pnpm e2e`.

## Prerequisites

1. A local Supabase stack with the migrations applied (`supabase start` / `supabase db reset`,
   see `docs/DEVELOPMENT.md`).
2. The local QA fixtures: `node scripts/dev/seed-local-fixtures.mjs` (users, employees, balances;
   password `Passw0rd!Local`, local only).
3. `.env.local` pointing at that stack (the helpers read `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` from it and refuse to run against a non-local Supabase URL).
4. The app running: `pnpm dev` (port 3000) or `pnpm build && pnpm start`.
5. A Chromium: `/opt/pw-browsers/chromium` is used when present (or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`);
   otherwise run `pnpm exec playwright install chromium` once.

## Running

```bash
pnpm e2e                                  # everything
pnpm e2e e2e/auth.spec.ts                 # one file
pnpm e2e -g "sidebar"                     # by title
E2E_BASE_URL=http://localhost:3100 pnpm e2e   # another server (e.g. a production build)
E2E_WORKERS=1 pnpm e2e                    # serial (slow machines)
```

Failures keep a trace, a screenshot and a page snapshot in `test-results/`
(`pnpm exec playwright show-trace <trace.zip>`). Against `pnpm dev` the first visit to each route
compiles it, so a cold run is slower than a warm one.

## Layout

| Path | Purpose |
|---|---|
| `global.setup.ts` | `setup` project: signs in super admin, HR admin, HR officer, manager and employee once and stores the sessions in `e2e/.auth/<role>.json` (git-ignored). The `app` project (every spec except the sign-in flows) depends on it; the `auth` project (`auth.spec.ts`, `language.spec.ts`) signs in by itself. |
| `helpers/users.ts` | Fixture accounts, password, `storageStatePath(role)`. |
| `helpers/auth.ts` | `login(page, role, { next, locale })`, `logout(page)`, `submitLogin`, `setLocaleCookie`, `expectDocumentLocale` (`<html lang dir>`). |
| `helpers/page-health.ts` | `watchPageHealth(page)`: console errors, uncaught page errors and 5xx responses. |
| `helpers/db.ts` | Local service-role PostgREST lookups (fixture ids, the live role matrix via `permissionSubject`) and restoring fixture state a spec changed. Never creates product data. |
| `auth.spec.ts` | Sign in / sign out, `next=` handling (off-site targets ignored), wrong password, unauthenticated redirects, pending → `/pending-approval`, disabled → `/account-disabled`, signed-in `/login` → dashboard, sign-in without JavaScript (progressive enhancement: POST to the Server Action), credentials stripped from URLs by the proxy. |
| `language.spec.ts` | Arabic → English → Arabic across reload, navigation, sign-out and a fresh sign-in (cookie + saved profile preference); `<html lang dir>` on every step. Uses `employee2@` and restores its preference. |
| `navigation.spec.ts` | Per role: the sidebar shows exactly the items `ROUTE_ACCESS` + the live role matrix allow, and page guards show the Forbidden state on every other route. As super admin: every route in ARCHITECTURE §9, in Arabic and English, loads without HTTP ≥ 400, a redirect to `/login`, console errors, page errors or 5xx responses. |
| `helpers/i18n.ts` | `tr(locale, 'namespace.key', vars)` reads `locales/{ar,en}/*.json`, so flows drive the UI in either language without hard-coded text. |
| `helpers/flows.ts` | Flow building blocks: `actor(browser, role, locale)` (stored session + language + health watcher), `visit`, `pickDate` (DatePicker by `[data-field]` + `td[data-day]`), request wizard helpers (`submitPayrollRequest`, `submitOvertimeRequest`), `actOnRequest`, `managerApprovesFromQueue`, read-only service-role lookups (`rest`, `requestRow`, `freeLeaveDay`). |
| `flows/request-submit.spec.ts` | §17 Employee: new Payroll issue through the 3-step wizard → submit → details page → Request Center list (ar + en). |
| `flows/request-approval.spec.ts` | §17 Manager approves from `/approvals` → HR approves and completes; HR returns → employee edits and resubmits → resumes at the HR step; approval → bell notification opens the request (ar + en). |
| `flows/leave.spec.ts` | §17 Leave: 1 day annual leave → manager → HR → Balances cards Pending → Used → calendar (manager, HR, own; reason never shown). Serial: both languages book leave for `employee@`. |
| `flows/certificate.spec.ts` | §17 Certificate: salary certificate request → HR preview + generate → PDF download (HR/owner 200, another employee and anonymous denied) → complete → public `/verify` shows only the allowed fields. |
| `flows/import.spec.ts` | §17 Import: template download → 3 rows (Arabic names, invalid email, duplicate Iqama) → review flags them → import → directory + global search. |
| `flows/report.spec.ts` | §17 Report: Employee master (department filter) and HR requests (status filter) → Excel/CSV/PDF exports (200, content type, CSV BOM, filter carried). |

Flow specs create clearly labelled data (`QA F2 …` markers, `QAF2-…` employee numbers) in the shared
database and never delete anything. Run them against the production build for stable timing:
`E2E_BASE_URL=http://localhost:3100 pnpm e2e e2e/flows`.

Stable selectors: sidebar links carry `data-nav-id="<nav item id>"`; the header has
`data-testid="language-switch"` and `data-testid="user-menu"`, and the sign-out item is
`data-testid="logout"`. Prefer these, roles and URLs over translated text; when text is needed, set
the language cookie first (`setLocaleCookie(context, 'en')`).

## Adding module flow specs

Put one spec per flow in `e2e/` (e.g. `requests.spec.ts`, `leave.spec.ts`), reuse the stored sessions
with `test.use({ storageState: storageStatePath('manager') })`, and follow PRODUCT-SPEC §17 for the
acceptance flows. Specs share one database: create what you need through the UI (or RPCs as the right
user), give records a unique marker (e.g. a timestamp in a comment), and never delete fixture data.
