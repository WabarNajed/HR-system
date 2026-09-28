import { expect, test, type Page } from '@playwright/test';
import { NAV_GROUPS, ROUTE_ACCESS, type RoutePattern } from '../src/components/shell/nav-config';
import { checkAccess } from '../src/lib/permissions';
import { expectDocumentLocale, setLocaleCookie, type Locale } from './helpers/auth';
import { anySubmittedRequestId, employeeIdByNumber, permissionSubject } from './helpers/db';
import { watchPageHealth } from './helpers/page-health';
import { SESSION_ROLES, storageStatePath, USERS, type SessionRole } from './helpers/users';

/* ─── Sidebar per role ─────────────────────────────────────────────────────────────────────────── */

const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
const ALL_NAV_IDS = NAV_ITEMS.map((i) => i.id);

/** Contract invariants (PRODUCT-SPEC §2/§16) that must hold whatever the role matrix says. */
const MUST_SEE: Partial<Record<SessionRole, readonly string[]>> = {
  employee: ['dashboard', 'requests', 'leave', 'documents', 'certificates'],
  manager: ['dashboard', 'employees', 'requests', 'approvals', 'leave'],
  superadmin: ALL_NAV_IDS,
};
const MUST_NOT_SEE: Partial<Record<SessionRole, readonly string[]>> = {
  employee: ['employees', 'approvals', 'reports', 'settings', 'auditLog', 'dataManagement', 'backup'],
  manager: ['settings', 'auditLog', 'dataManagement', 'backup'],
};

for (const role of SESSION_ROLES) {
  test.describe(`access · ${role}`, () => {
    test.use({ storageState: storageStatePath(role) });

    test(`sidebar shows exactly the items ${role} may open`, async ({ page }) => {
      const subject = await permissionSubject(USERS[role]);
      const expected = NAV_ITEMS.filter((i) => checkAccess(subject, i.access)).map((i) => i.id);
      for (const id of MUST_SEE[role] ?? []) expect(expected, `contract: ${role} sees ${id}`).toContain(id);
      for (const id of MUST_NOT_SEE[role] ?? []) expect(expected, `contract: ${role} never sees ${id}`).not.toContain(id);

      await setLocaleCookie(page.context(), 'en');
      await page.goto('/dashboard');
      const sidebar = page.locator('aside nav');
      await expect(sidebar.locator('a[data-nav-id="dashboard"]')).toBeVisible();
      const shown = await sidebar.locator('a[data-nav-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-nav-id')));
      expect(shown.sort()).toEqual([...expected].sort());
    });

    test(`page guards refuse ${role} on routes outside its access`, async ({ page }) => {
      test.setTimeout(300_000);
      const subject = await permissionSubject(USERS[role]);
      const denied = STATIC_ROUTES.filter((path) => !checkAccess(subject, ROUTE_ACCESS[path as RoutePattern]));
      test.skip(denied.length === 0, `${role} may open every route`);
      await setLocaleCookie(page.context(), 'en');
      const health = watchPageHealth(page);
      for (const path of denied) {
        const response = await page.goto(path);
        // forbidden() answers 403 unless the shell has already streamed (then the status stays 200).
        expect([200, 403], path).toContain(response?.status());
        await expect(page.getByRole('heading', { name: 'Access restricted' }), path).toBeVisible();
      }
      expect(health.pageErrors).toEqual([]);
      expect(health.serverErrors).toEqual([]);
    });
  });
}

/* ─── Every authenticated route (ARCHITECTURE §9) as super admin ─────────────────────────────── */

const STATIC_ROUTES = [
  '/dashboard', '/employees', '/employees/new', '/requests', '/requests/new', '/approvals', '/leave', '/documents',
  '/certificates', '/reports', '/reports/builder', '/notifications', '/profile', '/setup',
  '/settings', '/settings/organization', '/settings/branding', '/settings/users', '/settings/roles',
  '/settings/pending-registrations', '/settings/departments', '/settings/job-titles', '/settings/locations',
  '/settings/cost-centers', '/settings/leave-types', '/settings/public-holidays', '/settings/request-types',
  '/settings/form-builder', '/settings/workflows', '/settings/sla', '/settings/document-templates',
  '/settings/certificate-templates', '/settings/email-templates', '/settings/notifications', '/settings/security',
  '/admin/data-management', '/admin/audit-logs', '/admin/backup',
];

async function dynamicRoutes(page: Page): Promise<{ routes: string[]; skipped: string[] }> {
  const routes: string[] = [];
  const skipped: string[] = [];
  const employeeId = await employeeIdByNumber('QA-0004');
  routes.push(`/employees/${employeeId}`, `/employees/${employeeId}/edit`);
  const requestId = await anySubmittedRequestId();
  if (requestId) routes.push(`/requests/${requestId}`);
  else skipped.push('/requests/[id] (no submitted request in the database yet)');
  // Report keys come from the report catalog.
  await page.goto('/reports');
  const hrefs = await page.locator('main a[href^="/reports/"]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''));
  const report = hrefs.map((h) => h.split(/[?#]/)[0]!).find((h) => /^\/reports\/[\w-]+$/.test(h) && h !== '/reports/builder');
  if (report) routes.push(report);
  else skipped.push('/reports/[reportKey] (no report link on /reports yet)');
  return { routes, skipped };
}

async function visitAll(page: Page, locale: Locale, routes: string[]) {
  // ~13 routes per test; a cold `next dev` compiles each on first hit.
  test.setTimeout(600_000);
  await setLocaleCookie(page.context(), locale);
  const health = watchPageHealth(page);
  const problems: string[] = [];
  for (const path of routes) {
    health.reset();
    const response = await page.goto(path, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    const status = response?.status() ?? 0;
    const finalPath = new URL(page.url()).pathname;
    if (status >= 400) problems.push(`${path}: HTTP ${status}`);
    if (finalPath === '/login') problems.push(`${path}: redirected to /login`);
    await expectDocumentLocale(page, locale);
    if (health.pageErrors.length) problems.push(`${path}: page errors ${JSON.stringify(health.pageErrors)}`);
    if (health.consoleErrors.length) problems.push(`${path}: console errors ${JSON.stringify(health.consoleErrors)}`);
    if (health.serverErrors.length) problems.push(`${path}: 5xx ${JSON.stringify(health.serverErrors)}`);
  }
  expect(problems, problems.join('\n')).toEqual([]);
}

test.describe('every route as super admin', () => {
  test.use({ storageState: storageStatePath('superadmin') });

  const CHUNKS = 3;
  for (const locale of ['ar', 'en'] as const) {
    for (let i = 0; i < CHUNKS; i++) {
      const chunk = STATIC_ROUTES.filter((_, index) => index % CHUNKS === i);
      test(`static routes ${i + 1}/${CHUNKS} (${locale})`, async ({ page }) => {
        await visitAll(page, locale, chunk);
      });
    }

    test(`dynamic routes (${locale})`, async ({ page }) => {
      await setLocaleCookie(page.context(), locale);
      const { routes, skipped } = await dynamicRoutes(page);
      for (const s of skipped) test.info().annotations.push({ type: 'skipped-route', description: s });
      await visitAll(page, locale, routes);
    });
  }

  test('/ redirects to the dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
