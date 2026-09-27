import { expect, test, type Page } from '@playwright/test';
import { BASE_URL, expectDocumentLocale, localeCookie, login, logout, setLocaleCookie, type Locale } from './helpers/auth';
import { profileByEmail, setPreferredLanguage } from './helpers/db';
import { watchPageHealth } from './helpers/page-health';
import { USERS } from './helpers/users';

/**
 * Language persistence: Arabic → English → Arabic across refresh, navigation and sign-out/sign-in
 * (PRODUCT-SPEC §17). Uses employee2@ and restores its saved preference afterwards.
 */
test.describe.configure({ mode: 'serial' });

const EMAIL = USERS.employee2;
let original: { id: string; preferred_language: string | null };

test.beforeAll(async () => {
  original = await profileByEmail(EMAIL);
  await setPreferredLanguage(original.id, 'ar');
});

test.afterAll(async () => {
  if (original) await setPreferredLanguage(original.id, original.preferred_language);
});

async function switchLanguage(page: Page, to: Locale) {
  await page.getByTestId('language-switch').first().click();
  await expectDocumentLocale(page, to);
  await expect.poll(() => localeCookie(page.context())).toBe(to);
}

test('login page follows the language cookie', async ({ page }) => {
  for (const locale of ['ar', 'en'] as const) {
    await setLocaleCookie(page.context(), locale);
    await page.goto('/login');
    await expectDocumentLocale(page, locale);
  }
});

test('Arabic → English → Arabic persists across refresh, navigation and sign-in', async ({ page, browser }) => {
  const health = watchPageHealth(page);

  // Arabic by default (profile preference ar).
  await login(page, 'employee2', { locale: 'ar' });
  await expectDocumentLocale(page, 'ar');

  // → English: survives a reload and client-side navigation.
  await switchLanguage(page, 'en');
  await page.reload();
  await expectDocumentLocale(page, 'en');
  await page.locator('aside nav a[data-nav-id="requests"]').click();
  await expect(page).toHaveURL(/\/requests$/);
  await expectDocumentLocale(page, 'en');
  await expect.poll(async () => (await profileByEmail(EMAIL)).preferred_language).toBe('en');

  // Sign out: the sign-in page keeps English.
  await logout(page);
  await expectDocumentLocale(page, 'en');

  // A fresh browser (no cookie) signs in and gets English from the saved profile preference.
  const fresh = await browser.newContext({ baseURL: BASE_URL });
  const freshPage = await fresh.newPage();
  await login(freshPage, 'employee2');
  await expectDocumentLocale(freshPage, 'en');
  await expect.poll(() => localeCookie(fresh)).toBe('en');

  // → back to Arabic; survives reload, navigation and a new sign-in.
  await switchLanguage(freshPage, 'ar');
  await freshPage.reload();
  await expectDocumentLocale(freshPage, 'ar');
  await freshPage.locator('aside nav a[data-nav-id="leave"]').click();
  await expect(freshPage).toHaveURL(/\/leave$/);
  await expectDocumentLocale(freshPage, 'ar');
  await logout(freshPage);
  await expectDocumentLocale(freshPage, 'ar');
  await fresh.close();

  const again = await browser.newContext({ baseURL: BASE_URL });
  const againPage = await again.newPage();
  await login(againPage, 'employee2');
  await expectDocumentLocale(againPage, 'ar');
  await again.close();

  expect(await profileByEmail(EMAIL)).toMatchObject({ preferred_language: 'ar' });
  expect(health.pageErrors).toEqual([]);
  expect(health.serverErrors).toEqual([]);
});
