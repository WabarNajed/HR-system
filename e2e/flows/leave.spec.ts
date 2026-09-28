import { expect, test, type Page } from '@playwright/test';
import type { Locale } from '../helpers/auth';
import {
  actOnRequest,
  actor,
  ensureLeaveBalance,
  evidence,
  expectHealthy,
  expectRequestStatus,
  freeLeaveDay,
  managerApprovesFromQueue,
  marker,
  pickDate,
  requestRow,
  rest,
  startNewRequest,
  visit,
  wizardContinue,
  wizardSubmit,
} from '../helpers/flows';
import { escapeRe, tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Leave: employee submits annual leave → manager approves → HR approves →
 * balance moves Pending → Used (read from the /leave Balances cards) → the leave shows in the team
 * calendar (manager) and the organization calendar (HR). Arabic and English.
 */

// Both languages book leave for the same employee: run them one after the other so the balance deltas
// are not mixed up.
test.describe.configure({ mode: 'serial' });

type Balance = { used: number; pending: number; remaining: number };

async function annualName(locale: Locale): Promise<string> {
  const rows = await rest<{ name_ar: string; name_en: string }[]>('leave_types?select=name_ar,name_en&code=eq.annual');
  return locale === 'ar' ? rows[0]!.name_ar : rows[0]!.name_en;
}

/** Reads Used / Pending / Remaining from the "Annual leave" card on /leave?tab=balances&scope=mine. */
async function readAnnualBalance(page: Page, locale: Locale): Promise<Balance> {
  await visit(page, '/leave?tab=balances&scope=mine');
  const card = page
    .getByRole('main')
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: await annualName(locale) }) });
  await expect(card).toBeVisible();
  const value = async (key: string) => {
    const term = card.locator('dt').filter({ hasText: new RegExp(`^\\s*${escapeRe(tr(locale, `leave.fields.${key}`))}\\s*$`) });
    const text = (await term.locator('xpath=following-sibling::dd[1]').innerText()).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    return Number(text.replace(/[^\d.-]/g, ''));
  };
  return { used: await value('used'), pending: await value('pending'), remaining: await value('remaining') };
}

for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] annual leave: submit → manager → HR → balance → calendar`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const mgr = await actor(browser, 'manager', locale);
    const hr = await actor(browser, 'hrofficer', locale);
    const reason = marker('leave', locale);
    // Different windows per language so parallel runs don't pick the same day.
    const day = await freeLeaveDay('QA-0004', locale === 'ar' ? '2026-11-08' : '2026-12-16');
    // Precondition: repeated runs consume the fixture's annual balance — keep enough days available.
    await ensureLeaveBalance('QA-0004', 'annual', Number(day.slice(0, 4)), 3);
    try {
      const before = await readAnnualBalance(emp.page, locale);

      // Employee submits one day of annual leave.
      await startNewRequest(emp.page, locale, 'leave');
      await emp.page.locator('[data-field="leave_type"] [role="combobox"]').first().click();
      await emp.page.getByRole('option', { name: await annualName(locale) }).click();
      await pickDate(emp.page, 'start_date', day);
      await pickDate(emp.page, 'end_date', day);
      await emp.page.locator('[data-field="reason"] textarea').fill(reason);
      // "1 working day" / "يوم عمل واحد" once the server has calculated the days.
      await expect(emp.page.locator('[data-field="days"]')).toContainText(locale === 'ar' ? /يوم عمل واحد|\b1\b/ : /1 (working|business) day/);
      await wizardContinue(emp.page, locale);
      const id = await wizardSubmit(emp.page, locale);
      const { request_number: number, status } = await requestRow(id);
      expect(status).toBe('pending_manager_approval');
      const [leave] = await rest<{ days: number; start_date: string; end_date: string }[]>(
        `leave_requests?select=days,start_date,end_date&request_id=eq.${id}`,
      );
      expect(leave).toMatchObject({ days: 1, start_date: day, end_date: day });

      // Submission reserves the days as Pending.
      const submitted = await readAnnualBalance(emp.page, locale);
      expect(submitted.pending).toBe(before.pending + 1);
      expect(submitted.used).toBe(before.used);

      // Manager → HR.
      await managerApprovesFromQueue(mgr, number);
      await visit(hr.page, `/requests/${id}`);
      await actOnRequest(hr.page, locale, 'approve');
      await expectRequestStatus(hr.page, locale, 'approved');

      // Approval moves Pending → Used; Remaining drops by the leave days.
      const approved = await readAnnualBalance(emp.page, locale);
      expect(approved.pending).toBe(before.pending);
      expect(approved.used).toBe(before.used + 1);
      expect(approved.remaining).toBe(before.remaining - 1);

      // Calendars: manager (team) and HR (organization), list view of that month; reason never shown.
      const month = day.slice(0, 7);
      for (const a of [mgr, hr, emp]) {
        await visit(a.page, `/leave?tab=calendar&month=${month}&view=list`);
        const entry = a.page.getByRole('main').locator(`a[href="/requests/${id}"]`);
        await expect(entry, `calendar entry for ${number}`).toBeVisible();
        await expect(a.page.getByRole('main')).not.toContainText(reason);
      }
      for (const a of [emp, mgr, hr]) expectHealthy(a, `leave flow (${locale})`);
    } finally {
      await evidence(testInfo, emp, 'employee');
      await evidence(testInfo, mgr, 'manager');
      await Promise.all([emp.context.close(), mgr.context.close(), hr.context.close()]);
    }
  });
}
