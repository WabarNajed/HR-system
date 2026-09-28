import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { BASE_URL, expectDocumentLocale, setLocaleCookie, type Locale } from './auth';
import { assertLocalSupabase, SERVICE_ROLE_KEY, SUPABASE_URL } from './env';
import { escapeRe, exact, tr } from './i18n';
import { watchPageHealth, type PageHealth } from './page-health';
import { storageStatePath, type SessionRole } from './users';

/**
 * Shared building blocks for the PRODUCT-SPEC §17 acceptance flows (e2e/flows/*.spec.ts).
 * Every record a flow creates carries a "QA F2 <marker>" text so it is recognisable in the shared DB.
 */

export type Actor = { context: BrowserContext; page: Page; health: PageHealth; locale: Locale };

/** A signed-in browser context for a stored fixture session, in the given UI language. */
export async function actor(browser: Browser, role: SessionRole, locale: Locale): Promise<Actor> {
  const context = await browser.newContext({ baseURL: BASE_URL, storageState: storageStatePath(role), acceptDownloads: true });
  await setLocaleCookie(context, locale);
  const page = await context.newPage();
  const health = watchPageHealth(page);
  return { context, page, health, locale };
}

/** Navigates and waits for the page to be usable (production `<Link>` prefetching keeps the network busy). */
export async function visit(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => {});
}

/** Unique, human-recognisable marker for records created by a flow. */
export function marker(flow: string, locale: Locale): string {
  return `QA F2 ${flow} ${locale} ${Date.now().toString(36)}`;
}

/** Attaches a full-page screenshot and the collected console / page / 5xx errors to the report. */
export async function evidence(testInfo: TestInfo, a: Actor, name: string): Promise<void> {
  await testInfo.attach(`${name}.png`, { body: await a.page.screenshot({ fullPage: true }), contentType: 'image/png' }).catch(() => {});
  const { consoleErrors, pageErrors, serverErrors } = a.health;
  if (consoleErrors.length || pageErrors.length || serverErrors.length) {
    await testInfo.attach(`${name}-errors.json`, {
      body: JSON.stringify({ url: a.page.url(), consoleErrors, pageErrors, serverErrors }, null, 2),
      contentType: 'application/json',
    });
  }
}

/** Asserts the page collected no uncaught errors / 5xx responses (console errors are soft-asserted). */
export function expectHealthy(a: Actor, where: string): void {
  expect.soft(a.health.pageErrors, `uncaught page errors on ${where}`).toEqual([]);
  expect.soft(a.health.serverErrors, `5xx responses on ${where}`).toEqual([]);
  expect.soft(a.health.consoleErrors, `console errors on ${where}`).toEqual([]);
}

/* ─── Local data lookups (service role, read-only) ──────────────────────────────────────────── */

export async function rest<T>(pathAndQuery: string): Promise<T> {
  assertLocalSupabase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: SERVICE_ROLE_KEY!, Authorization: `Bearer ${SERVICE_ROLE_KEY!}` },
  });
  if (!res.ok) throw new Error(`PostgREST GET ${pathAndQuery} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function requestTypeName(key: string, locale: Locale): Promise<string> {
  const rows = await rest<{ name_ar: string; name_en: string }[]>(`request_types?select=name_ar,name_en&key=eq.${key}`);
  if (!rows[0]) throw new Error(`request type ${key} missing`);
  return locale === 'ar' ? rows[0].name_ar : rows[0].name_en;
}

export async function requestRow(id: string) {
  const rows = await rest<{ id: string; request_number: string; status: string; current_step_order: number | null; current_step_type: string | null }[]>(
    `hr_requests?select=id,request_number,status,current_step_order,current_step_type&id=eq.${id}`,
  );
  return rows[0]!;
}

/** First working day (Sun–Thu, not a public holiday, no overlapping leave of the employee) on/after `from`. */
export async function freeLeaveDay(employeeNumber: string, from: string, avoid: string[] = []): Promise<string> {
  const emp = await rest<{ id: string }[]>(`employees?select=id&employee_number=eq.${employeeNumber}`);
  const leaves = await rest<{ start_date: string; end_date: string; hr_requests: { status: string } | null }[]>(
    `leave_requests?select=start_date,end_date,hr_requests(status)&employee_id=eq.${emp[0]!.id}`,
  );
  const holidays = await rest<{ start_date: string; end_date: string }[]>('public_holidays?select=start_date,end_date');
  const active = leaves.filter((l) => !['cancelled', 'rejected', 'draft'].includes(l.hr_requests?.status ?? ''));
  const d = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < 120; i++, d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 5 || dow === 6) continue;
    if (avoid.includes(iso)) continue;
    if (holidays.some((h) => h.start_date <= iso && iso <= h.end_date)) continue;
    if (active.some((l) => l.start_date <= iso && iso <= l.end_date)) continue;
    return iso;
  }
  throw new Error('no free leave day found');
}

/* ─── UI primitives ─────────────────────────────────────────────────────────────────────────── */

/** Picks an ISO date in the DatePicker of a dynamic-form field (`[data-field=<key>]`). */
export async function pickDate(page: Page, fieldKey: string, iso: string): Promise<void> {
  await page.locator(`[data-field="${fieldKey}"] button[aria-haspopup="dialog"]`).first().click();
  const popover = page.locator('[data-slot="popover-content"]').last();
  await expect(popover).toBeVisible();
  for (let i = 0; i < 24; i++) {
    const cell = popover.locator(`td[data-day="${iso}"]:not([data-outside="true"]) button`);
    if (await cell.count()) {
      await cell.first().click();
      await expect(popover).toBeHidden();
      return;
    }
    await popover.locator('.rdp-button_next').click();
  }
  throw new Error(`date ${iso} not reachable in the calendar`);
}

/** Clicks the wizard's Continue button (common.continue). */
export async function wizardContinue(page: Page, locale: Locale): Promise<void> {
  await page.getByRole('button', { name: exact(tr(locale, 'common.continue')) }).click();
}

/** Submits from the review step and waits for the request details page; returns the request id. */
export async function wizardSubmit(page: Page, locale: Locale): Promise<string> {
  await expect(page.getByRole('heading', { name: tr(locale, 'requests.wizard.reviewTitle') })).toBeVisible();
  await page.getByRole('button', { name: exact(tr(locale, 'requests.wizard.submit')) }).click();
  await page.waitForURL(/\/requests\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  return page.url().split('/').pop()!;
}

/** Status label of a request on its details page header. */
export function statusLabel(locale: Locale, status: string): string {
  return tr(locale, `statuses.request.${status}`);
}

export async function expectRequestStatus(page: Page, locale: Locale, status: string): Promise<void> {
  await expect(page.locator('main').getByText(statusLabel(locale, status), { exact: true }).first()).toBeVisible();
}

/**
 * Runs a workflow action from the request details "Actions" card and confirms the dialog.
 * `action` ∈ approve | reject | return | start | complete | cancel.
 */
export async function actOnRequest(page: Page, locale: Locale, action: 'approve' | 'reject' | 'return' | 'start' | 'complete' | 'cancel', comment?: string): Promise<void> {
  const aside = page.locator('main aside, main [role="complementary"]').first();
  await aside.getByRole('button', { name: exact(tr(locale, `requests.actions.${action}`)) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (comment) await dialog.locator('textarea').fill(comment);
  await dialog.getByRole('button', { name: exact(tr(locale, `requests.decision.${action}.confirm`)) }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** Opens `/requests/new`, picks the type card by its localized name and waits for the Details step. */
export async function startNewRequest(page: Page, locale: Locale, typeKey: string): Promise<void> {
  await visit(page, '/requests/new');
  await expectDocumentLocale(page, locale);
  const name = await requestTypeName(typeKey, locale);
  await page.getByRole('main').getByRole('button', { name: new RegExp(escapeRe(name)) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
}

/** Payroll issue (Employee → HR): fills every field, submits and returns the request id. */
export async function submitPayrollRequest(page: Page, locale: Locale, description: string): Promise<string> {
  await startNewRequest(page, locale, 'payroll');
  await page.locator('[data-field="subtype"] [role="radio"]').nth(1).click();
  await page.locator('[data-field="payroll_month"] [role="combobox"]').first().click();
  await page.getByRole('option').nth(7).click();
  await page.locator('[data-field="amount"] input').fill('1500');
  await page.locator('[data-field="description"] textarea').fill(description);
  await wizardContinue(page, locale);
  await expect(page.getByText(description)).toBeVisible();
  return wizardSubmit(page, locale);
}

/** Overtime (Employee → Manager → HR): fills every field, submits and returns the request id. */
export async function submitOvertimeRequest(page: Page, locale: Locale, reason: string, dateIso: string): Promise<string> {
  await startNewRequest(page, locale, 'overtime');
  await pickDate(page, 'overtime_date', dateIso);
  await page.locator('[data-field="start_time"] input').fill('17:00');
  await page.locator('[data-field="end_time"] input').fill('19:00');
  const hours = page.locator('[data-field="hours"] input');
  if (await hours.isEditable()) await hours.fill('2');
  await page.locator('[data-field="reason"] textarea').fill(reason);
  await wizardContinue(page, locale);
  await expect(page.getByText(reason)).toBeVisible();
  return wizardSubmit(page, locale);
}

/** Manager: approves a request with the quick action of the /approvals queue. */
export async function managerApprovesFromQueue(mgr: Actor, number: string): Promise<void> {
  const { page, locale } = mgr;
  await visit(page, '/approvals');
  await expectDocumentLocale(page, locale);
  const row = page.getByRole('main').getByRole('row').filter({ hasText: number });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: exact(tr(locale, 'approvals.quick.approve')) }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: exact(tr(locale, 'requests.decision.approve.confirm')) }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  // Decided → leaves the pending queue.
  await expect(page.getByRole('main').getByRole('row').filter({ hasText: number })).toHaveCount(0, { timeout: 30_000 });
}

/**
 * Directory for artefacts a flow writes (downloaded templates, generated workbooks). ASCII-only path:
 * test titles contain "→", and Chromium cannot read upload files from non-ASCII paths in a C locale.
 */
export function workDir(testInfo: TestInfo): string {
  const dir = path.join(testInfo.project.outputDir, 'flow-work', `${testInfo.testId}-${testInfo.retry}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
