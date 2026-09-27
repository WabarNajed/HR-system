import { expect, type BrowserContext, type Page } from '@playwright/test';
import { FIXTURE_PASSWORD, USERS, type FixtureUser } from './users';

export type Locale = 'ar' | 'en';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** Sets the UI language cookie (`NEXT_LOCALE`) for the app's origin. */
export async function setLocaleCookie(context: BrowserContext, locale: Locale): Promise<void> {
  const { hostname } = new URL(BASE_URL);
  await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, domain: hostname, path: '/', sameSite: 'Lax' }]);
}

/** Current `NEXT_LOCALE` cookie value, if any. */
export async function localeCookie(context: BrowserContext): Promise<string | undefined> {
  return (await context.cookies(BASE_URL)).find((c) => c.name === 'NEXT_LOCALE')?.value;
}

/** Asserts `<html lang dir>` for the locale. */
export async function expectDocumentLocale(page: Page, locale: Locale): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

/** Fills and submits the sign-in form on the current /login page. */
export async function submitLogin(page: Page, user: FixtureUser | string, password = FIXTURE_PASSWORD): Promise<void> {
  const email = user in USERS ? USERS[user as FixtureUser] : user;
  await page.locator('input[name=email]').fill(email);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

/**
 * Signs in through the real /login form and waits until the app has left /login.
 * `next` is passed as `/login?next=…`; `locale` sets the language cookie first.
 */
export async function login(page: Page, user: FixtureUser, options: { next?: string; locale?: Locale } = {}): Promise<void> {
  if (options.locale) await setLocaleCookie(page.context(), options.locale);
  const url = options.next ? `/login?next=${encodeURIComponent(options.next)}` : '/login';
  await page.goto(url);
  // Submit only after hydration: a native (pre-hydration) submit is not the sign-in action.
  await page.waitForLoadState('networkidle').catch(() => {});
  await submitLogin(page, user);
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 150_000 });
}

/** Signs out through the header user menu and waits for /login. */
export async function logout(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click();
  await page.getByTestId('logout').click();
  await page.waitForURL((u) => u.pathname === '/login', { timeout: 150_000 });
}
