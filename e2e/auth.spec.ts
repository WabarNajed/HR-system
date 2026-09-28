import { expect, test } from '@playwright/test';
import { expectDocumentLocale, login, logout, setLocaleCookie, submitLogin } from './helpers/auth';
import { watchPageHealth } from './helpers/page-health';

test.describe('authentication', () => {
  test('unauthenticated visitors are sent to /login with a next= return path', async ({ page }) => {
    const response = await page.goto('/employees?tab=all');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL((u) => u.pathname === '/login' && u.searchParams.get('next') === '/employees?tab=all');
    await expect(page.locator('input[name=email]')).toBeVisible();
  });

  test('the root path redirects to the dashboard (via /login when signed out)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL((u) => u.pathname === '/login');
  });

  test('public auth pages render for signed-out visitors', async ({ page }) => {
    const health = watchPageHealth(page);
    for (const path of ['/login', '/register', '/forgot-password']) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page, path).toHaveURL((u) => u.pathname === path);
    }
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test('sign in lands on the dashboard; sign out returns to /login and ends the session', async ({ page }) => {
    const health = watchPageHealth(page);
    await login(page, 'employee', { locale: 'ar' });
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator('aside nav a[data-nav-id="dashboard"]')).toBeVisible();

    await logout(page);
    await expect(page).toHaveURL((u) => u.pathname === '/login' && u.searchParams.get('signedout') === '1');

    await page.goto('/dashboard');
    await expect(page).toHaveURL((u) => u.pathname === '/login');
    expect(health.pageErrors).toEqual([]);
    expect(health.serverErrors).toEqual([]);
  });

  test('sign in honours next= (same-origin paths only)', async ({ page }) => {
    await login(page, 'hradmin', { next: '/employees' });
    await expect(page).toHaveURL(/\/employees$/);
  });

  test('an off-site next= is ignored', async ({ page }) => {
    await login(page, 'hradmin', { next: '//evil.example.com/steal' });
    await expect(page).toHaveURL(/localhost:\d+\/dashboard$/);
  });

  test('wrong password shows an error and stays on /login', async ({ page }) => {
    await setLocaleCookie(page.context(), 'en');
    await page.goto('/login');
    await page.waitForLoadState('networkidle').catch(() => {});
    await submitLogin(page, 'employee', 'not-the-password');
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
    await expect(page).toHaveURL((u) => u.pathname === '/login');
  });

  test('credentials never stay in a URL (pre-hydration GET submit)', async ({ request }) => {
    const response = await request.get('/login?email=employee%40hr.local&password=secret&next=%2Fleave', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    const location = new URL(response.headers()['location']!, 'http://x');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.has('password')).toBe(false);
    expect(location.searchParams.has('email')).toBe(false);
    expect(location.searchParams.get('next')).toBe('/leave');
  });

  test.describe('before hydration / without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the sign-in form posts to the server action and never puts credentials in a URL', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (r) => {
        if (r.isNavigationRequest()) requests.push(`${r.method()} ${r.url()}`);
      });
      await setLocaleCookie(page.context(), 'en');
      await page.goto('/login?next=%2Fleave');
      await submitLogin(page, 'employee', 'not-the-password');
      await expect(page.getByText('Incorrect email or password.')).toBeVisible();
      await expect(page.locator('input[name=email]')).toHaveValue('employee@hr.local');
      await submitLogin(page, 'employee');
      await expect(page).toHaveURL(/\/leave$/, { timeout: 150_000 });
      expect(requests.filter((r) => r.startsWith('GET ') && /password|Passw0rd/i.test(r))).toEqual([]);
      expect(requests.some((r) => r.startsWith('POST ') && r.includes('/login'))).toBe(true);
    });
  });

  test('a pending registration is sent to /pending-approval', async ({ page }) => {
    await login(page, 'pending', { locale: 'en' });
    await expect(page).toHaveURL(/\/pending-approval$/);
    // The app shell stays closed to pending accounts.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/pending-approval$/);
    await expectDocumentLocale(page, 'en');
  });

  test('a disabled account cannot use the portal', async ({ page }) => {
    await setLocaleCookie(page.context(), 'en');
    await page.goto('/login');
    await page.waitForLoadState('networkidle').catch(() => {});
    await submitLogin(page, 'disabled');
    // Profile-disabled users land on /account-disabled; users also banned in Auth get the error on /login.
    await expect
      .poll(async () => {
        if (new URL(page.url()).pathname === '/account-disabled') return 'account-disabled';
        if (await page.getByText('Your account has been disabled').isVisible()) return 'login-error';
        return 'waiting';
      }, { timeout: 60_000 })
      .not.toBe('waiting');
    await page.goto('/dashboard');
    await expect(page).toHaveURL((u) => u.pathname === '/account-disabled' || u.pathname === '/login');
  });

  test('visiting /login while signed in goes to the dashboard', async ({ page }) => {
    await login(page, 'employee');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('an idle session is signed out (Settings › Security session timeout)', async ({ page }) => {
    await login(page, 'employee2');
    await expect(page).toHaveURL(/\/dashboard$/);
    // Last activity (shared by all tabs) further back than the longest allowed limit (7 days).
    await page.evaluate(() => window.localStorage.setItem('hr:last-activity', String(Date.now() - 8 * 24 * 3600_000)));
    await expect(page).toHaveURL((u) => u.pathname === '/login' && u.searchParams.get('error') === 'session_expired', { timeout: 30_000 });
    await page.goto('/dashboard');
    await expect(page).toHaveURL((u) => u.pathname === '/login');
  });
});

test.describe('platform', () => {
  test('public pages ship only the shared and auth message namespaces', async ({ request }) => {
    for (const locale of ['ar', 'en'] as const) {
      const response = await request.get('/login', { headers: { cookie: `NEXT_LOCALE=${locale}` } });
      expect(response.status()).toBe(200);
      const html = await response.text();
      // The whole catalog was ~340 KB (ar) in every page; /login needs common/errors/validation/nav/auth.
      expect(html.length, `/login (${locale}) HTML size`).toBeLessThan(200_000);
      expect(html).toMatch(/\\?"auth\\?":\{/);
      for (const ns of ['requestConfig', 'dataManagement', 'reports', 'employees']) expect(html, ns).not.toMatch(new RegExp(`\\\\?"${ns}\\\\?":\\{`));
    }
    const verify = await request.get('/verify/NO-SUCH-CERT');
    expect((await verify.text()).length, '/verify HTML size').toBeLessThan(200_000);
  });

  test('responses carry the security headers', async ({ request }) => {
    for (const path of ['/login', '/verify/NO-SUCH-CERT']) {
      const headers = (await request.get(path)).headers();
      expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'");
      expect(headers['content-security-policy'], path).toContain("object-src 'self' blob:");
      expect(headers['x-frame-options'], path).toBe('DENY');
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
      expect(headers['permissions-policy'], path).toContain('camera=()');
    }
  });

  test('the sign-in form renders without React errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/login');
    await page.waitForLoadState('networkidle').catch(() => {});
    await expect(page.locator('form input[name=email]')).toBeVisible();
    expect(errors.filter((e) => /encType or method|Content Security Policy|MISSING_MESSAGE/i.test(e))).toEqual([]);
  });
});
