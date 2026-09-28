import { expect, test } from '@playwright/test';
import { expectDocumentLocale } from '../helpers/auth';
import { actor, evidence, expectHealthy, expectRequestStatus, marker, requestRow, submitPayrollRequest, visit } from '../helpers/flows';
import { tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Employee: login → new request → submit → view.
 * A non-leave request (Payroll issue, Employee → HR) through the 3-step wizard, then its details page
 * and the "My requests" list. Arabic (primary) and English.
 */
for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] employee submits a payroll issue and views it`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const text = marker('payroll', locale);
    try {
      const id = await submitPayrollRequest(emp.page, locale, text);
      await expectDocumentLocale(emp.page, locale);

      // Details page: number, status, the submitted data and the approval path.
      const row = await requestRow(id);
      expect(row.request_number).toMatch(/^HR-\d{4}-\d{6}$/);
      expect(row.status).toBe('pending_hr_review');
      await expect(emp.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(emp.page.getByText(row.request_number).first()).toBeVisible();
      await expectRequestStatus(emp.page, locale, 'pending_hr_review');
      await expect(emp.page.getByText(text)).toBeVisible();
      await expect(emp.page.getByRole('heading', { name: tr(locale, 'requests.actions.title') })).toBeVisible();

      // The request is listed in the Request Center and opens from there.
      await visit(emp.page, `/requests?q=${encodeURIComponent(row.request_number)}`);
      const listed = emp.page.getByRole('main').getByRole('row').filter({ hasText: row.request_number }).first();
      await expect(listed).toBeVisible();
      await expect(listed).toContainText(tr(locale, `statuses.request.pending_hr_review`));
      await listed.getByText(row.request_number).click(); // rows open the request (rowHref)
      await emp.page.waitForURL(new RegExp(`/requests/${id}$`));
      await expect(emp.page.getByText(text)).toBeVisible();
      expectHealthy(emp, 'employee request flow');
    } finally {
      await evidence(testInfo, emp, 'employee-request');
      await emp.context.close();
    }
  });
}
