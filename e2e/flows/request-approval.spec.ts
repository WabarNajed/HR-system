import { expect, test } from '@playwright/test';
import {
  actOnRequest,
  actor,
  evidence,
  expectHealthy,
  expectRequestStatus,
  marker,
  requestRow,
  submitOvertimeRequest,
  managerApprovesFromQueue,
  submitPayrollRequest,
  visit,
} from '../helpers/flows';
import { exact, tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Manager: login → approvals → approve. HR: login → review → complete.
 * Return: HR returns → employee edits → resubmits → resumes at the returning step.
 * Notifications (§14): an approval notifies the requester; clicking the bell item opens the request.
 */

const TODAY = new Date().toISOString().slice(0, 10);

for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] manager approves from the queue, HR reviews and completes`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const mgr = await actor(browser, 'manager', locale);
    const hr = await actor(browser, 'hrofficer', locale);
    const text = marker('overtime', locale);
    try {
      const id = await submitOvertimeRequest(emp.page, locale, text, TODAY);
      const { request_number: number, status } = await requestRow(id);
      expect(status).toBe('pending_manager_approval');
      await expectRequestStatus(emp.page, locale, 'pending_manager_approval');

      await managerApprovesFromQueue(mgr, number);
      expect((await requestRow(id)).status).toBe('pending_hr_review');

      // HR: review queue → open → approve → complete.
      await visit(hr.page, `/requests?q=${encodeURIComponent(number)}`);
      await hr.page.getByRole('main').getByRole('row').filter({ hasText: number }).getByText(number).click();
      await hr.page.waitForURL(new RegExp(`/requests/${id}$`));
      await expect(hr.page.getByText(text)).toBeVisible();
      await actOnRequest(hr.page, locale, 'approve');
      await expectRequestStatus(hr.page, locale, 'approved');
      await actOnRequest(hr.page, locale, 'complete');
      await expectRequestStatus(hr.page, locale, 'completed');
      expect((await requestRow(id)).status).toBe('completed');

      // The employee sees the final state and the full history.
      await visit(emp.page, `/requests/${id}`);
      await expectRequestStatus(emp.page, locale, 'completed');
      await expect(emp.page.getByText(tr(locale, 'requests.actions.none.completed'))).toBeVisible();
      for (const a of [emp, mgr, hr]) expectHealthy(a, `approval flow (${locale})`);
    } finally {
      await evidence(testInfo, emp, 'employee');
      await evidence(testInfo, mgr, 'manager');
      await evidence(testInfo, hr, 'hr');
      await Promise.all([emp.context.close(), mgr.context.close(), hr.context.close()]);
    }
  });
}

for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] HR returns for information → employee edits and resubmits → resumes at the HR step`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const mgr = await actor(browser, 'manager', locale);
    const hr = await actor(browser, 'hrofficer', locale);
    const text = marker('return', locale);
    const needed = `${text} — ${locale === 'ar' ? 'يرجى توضيح سبب العمل الإضافي' : 'please explain the overtime'}`;
    try {
      const id = await submitOvertimeRequest(emp.page, locale, text, TODAY);
      const { request_number: number } = await requestRow(id);
      await managerApprovesFromQueue(mgr, number);

      // HR (step 2) returns it with the required comment.
      await visit(hr.page, `/requests/${id}`);
      await actOnRequest(hr.page, locale, 'return', needed);
      await expectRequestStatus(hr.page, locale, 'returned');
      const returned = await requestRow(id);
      expect(returned.status).toBe('returned');

      // Employee: sees the reason, edits a field, resubmits.
      await visit(emp.page, `/requests/${id}`);
      await expectRequestStatus(emp.page, locale, 'returned');
      await expect(emp.page.getByText(needed).first()).toBeVisible();
      await emp.page
        .getByRole('main')
        .getByRole('link', {
          name: tr(locale, 'requests.actions.editResubmit'),
        })
        .or(
          emp.page.getByRole('main').getByRole('button', {
            name: tr(locale, 'requests.actions.editResubmit'),
          }),
        )
        .first()
        .click();
      await expect(emp.page.locator('[data-field="reason"] textarea')).toBeVisible();
      const edited = `${text} (edited)`;
      await emp.page.locator('[data-field="reason"] textarea').fill(edited);
      await emp.page
        .getByRole('button', {
          name: exact(tr(locale, 'requests.edit.resubmit')),
        })
        .click();
      const confirm = emp.page.getByRole('alertdialog').or(emp.page.getByRole('dialog'));
      if (
        await confirm
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await confirm
          .first()
          .getByRole('button', {
            name: exact(tr(locale, 'requests.edit.resubmit')),
          })
          .click();
      }

      // Resumes at HR review (the step that returned it), not back at the manager.
      await expect.poll(async () => (await requestRow(id)).status, { timeout: 30_000 }).toBe('pending_hr_review');
      const resumed = await requestRow(id);
      expect(resumed.current_step_type).toBe('hr');
      await visit(emp.page, `/requests/${id}`);
      await expectRequestStatus(emp.page, locale, 'pending_hr_review');
      await expect(emp.page.getByText(edited)).toBeVisible();

      // HR can act on it again.
      await visit(hr.page, `/requests/${id}`);
      await expect(
        hr.page.getByRole('button', {
          name: exact(tr(locale, 'requests.actions.approve')),
        }),
      ).toBeVisible();
      for (const a of [emp, mgr, hr]) expectHealthy(a, 'return flow');
    } finally {
      await evidence(testInfo, emp, 'employee');
      await evidence(testInfo, hr, 'hr');
      await Promise.all([emp.context.close(), mgr.context.close(), hr.context.close()]);
    }
  });

  test(`[${locale}] an approval notifies the requester; the bell item opens the request`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const hr = await actor(browser, 'hrofficer', locale);
    const text = marker('notify', locale);
    try {
      const id = await submitPayrollRequest(emp.page, locale, text);
      const { request_number: number } = await requestRow(id);
      await visit(hr.page, `/requests/${id}`);
      await actOnRequest(hr.page, locale, 'approve');
      await expectRequestStatus(hr.page, locale, 'approved');

      // Employee: bell → newest notification about this request → opens it.
      await visit(emp.page, '/dashboard');
      const bell = emp.page.locator('header').getByRole('button', {
        name: new RegExp(`^${tr(locale, 'nav.header.notifications')} ·`),
      });
      await bell.click();
      const popover = emp.page.locator('[data-slot="popover-content"]').last();
      await expect(
        popover.getByRole('heading', {
          name: tr(locale, 'notifications.bell.title'),
        }),
      ).toBeVisible();
      const title = tr(locale, 'notifications.types.request_approved.title', {
        number,
      });
      const item = popover.getByRole('button').filter({ hasText: title }).first();
      await expect(item).toBeVisible({ timeout: 30_000 });
      await item.click();
      await emp.page.waitForURL(new RegExp(`/requests/${id}$`), {
        timeout: 30_000,
      });
      await expectRequestStatus(emp.page, locale, 'approved');
      expectHealthy(emp, 'notification flow');
    } finally {
      await evidence(testInfo, emp, 'employee');
      await Promise.all([emp.context.close(), hr.context.close()]);
    }
  });
}
