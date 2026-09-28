import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { BASE_URL, login, setLocaleCookie } from '../helpers/auth';
import {
  actOnRequest,
  actor,
  evidence,
  expectHealthy,
  expectRequestStatus,
  marker,
  requestRow,
  rest,
  startNewRequest,
  visit,
  wizardContinue,
  wizardSubmit,
} from '../helpers/flows';
import { exact, tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Certificate: employee requests a salary certificate → HR previews and generates
 * the PDF from the published template → download (HR and the owner allowed, another employee and
 * anonymous denied) → HR completes → public QR /verify page shows ONLY number, employee name, type,
 * issue date and status (§12). Arabic and English.
 */

for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] salary certificate: request → generate PDF → download rights → verify`, async ({ browser }, testInfo) => {
    const emp = await actor(browser, 'employee', locale);
    const hr = await actor(browser, 'hrofficer', locale);
    const addressedTo = marker('cert', locale);
    const [employee] = await rest<{ id: string; employee_number: string; national_id: string; passport_number: string | null }[]>(
      'employees?select=id,employee_number,national_id,passport_number&employee_number=eq.QA-0004',
    );
    const [pay] = await rest<{ basic_salary: number; housing_allowance: number; total_salary: number }[]>(
      `employee_compensation?select=basic_salary,housing_allowance,total_salary&employee_id=eq.${employee!.id}&order=effective_date.desc&limit=1`,
    );
    try {
      // Employee: Certificate request → Salary certificate, certificate language = UI language, include salary.
      await startNewRequest(emp.page, locale, 'certificate');
      await emp.page.locator('[data-field="subtype"] [role="radio"]').first().click();
      await emp.page.locator('[data-field="language"] [role="combobox"]').first().click();
      await emp.page.getByRole('option').nth(locale === 'ar' ? 0 : 1).click();
      await emp.page.locator('[data-field="addressed_to"] input').fill(addressedTo);
      await emp.page.locator('[data-field="include_salary"] [role="switch"]').click();
      await wizardContinue(emp.page, locale);
      const id = await wizardSubmit(emp.page, locale);
      const { request_number: number } = await requestRow(id);
      await expectRequestStatus(emp.page, locale, 'pending_hr_review');

      // HR: preview, then generate from the default published template.
      await visit(hr.page, `/requests/${id}`);
      await expect(hr.page.getByRole('heading', { name: tr(locale, 'certificates.panel.issueTitle') }).or(
        hr.page.getByRole('button', { name: exact(tr(locale, 'certificates.panel.generate')) }),
      ).first()).toBeVisible();
      await hr.page.getByRole('button', { name: exact(tr(locale, 'certificates.panel.preview')) }).click();
      const preview = hr.page.getByRole('dialog');
      await expect(preview).toBeVisible();
      await expect(preview.locator('iframe')).toBeVisible();
      const srcdoc = await preview.locator('iframe').first().getAttribute('srcdoc');
      if (srcdoc) fs.writeFileSync(testInfo.outputPath('preview-srcdoc.html'), srcdoc);
      await hr.page.keyboard.press('Escape');
      await expect(preview).toBeHidden();
      await hr.page.getByRole('button', { name: exact(tr(locale, 'certificates.panel.generate')) }).click();
      const download = hr.page.getByRole('main').getByRole('link', { name: tr(locale, 'certificates.actions.download') }).first();
      await expect(download).toBeVisible({ timeout: 60_000 });
      const href = (await download.getAttribute('href'))!;
      const [cert] = await rest<{ certificate_number: string; status: string; storage_path: string }[]>(
        `certificates?select=certificate_number,status,storage_path&request_id=eq.${id}&order=created_at.desc&limit=1`,
      );
      expect(cert!.certificate_number).toMatch(/^CERT-\d{4}-\d{6}$/);
      expect(href).toContain(cert!.certificate_number);
      await expect(hr.page.getByRole('main').getByText(cert!.certificate_number).first()).toBeVisible();

      // Real browser download from the UI (HR).
      const [file] = await Promise.all([hr.page.waitForEvent('download'), download.click()]);
      expect(file.suggestedFilename()).toMatch(/\.pdf$/i);

      // Download rights: HR and the owner get the PDF; another employee and anonymous users do not.
      for (const [who, ctx] of [['hr', hr.context], ['owner', emp.context]] as const) {
        const res = await ctx.request.get(href);
        expect(res.status(), `${who} download`).toBe(200);
        expect(res.headers()['content-type'], `${who} content-type`).toContain('application/pdf');
        const body = await res.body();
        expect(body.subarray(0, 5).toString(), `${who} body`).toBe('%PDF-');
        expect(body.length).toBeGreaterThan(5_000);
      }
      const other = await browser.newContext({ baseURL: BASE_URL });
      const anon = await browser.newContext({ baseURL: BASE_URL });
      try {
        const otherPage = await other.newPage();
        await login(otherPage, 'employee2', { locale });
        const denied = await other.request.get(href, { maxRedirects: 0 });
        expect(denied.status(), 'another employee must not download the certificate').not.toBe(200);
        expect(denied.headers()['content-type'] ?? '').not.toContain('application/pdf');
        const anonRes = await anon.request.get(href, { maxRedirects: 0 });
        expect(anonRes.status(), 'anonymous must not download the certificate').not.toBe(200);
        expect(anonRes.headers()['content-type'] ?? '').not.toContain('application/pdf');
      } finally {
        await other.close();
      }

      // The owner sees the certificate in the Certificate Center.
      await visit(emp.page, '/certificates?tab=issued');
      await expect(emp.page.getByRole('main').getByRole('row').filter({ hasText: cert!.certificate_number })).toBeVisible();

      // HR completes the request.
      await visit(hr.page, `/requests/${id}`);
      await hr.page.getByRole('button', { name: exact(tr(locale, 'certificates.panel.complete')) }).click();
      const dialog = hr.page.getByRole('dialog');
      if (await dialog.isVisible().catch(() => false)) {
        await dialog.getByRole('button', { name: exact(tr(locale, 'requests.decision.complete.confirm')) }).click();
      }
      await expect.poll(async () => (await requestRow(id)).status, { timeout: 30_000 }).toBe('completed');
      await visit(hr.page, `/requests/${id}`);
      await expectRequestStatus(hr.page, locale, 'completed');

      // Public verification (QR target): only the allowed fields.
      await setLocaleCookie(anon, locale);
      const pub = await anon.newPage();
      await pub.goto(`/verify/${cert!.certificate_number}`);
      const main = pub.getByRole('main');
      await expect(main.getByText(cert!.certificate_number).first()).toBeVisible();
      await expect(main.getByText(tr(locale, 'statuses.certificate.valid'), { exact: true }).first()).toBeVisible();
      const text = await main.innerText();
      const forbidden = [
        employee!.employee_number,
        employee!.national_id,
        employee!.passport_number,
        addressedTo,
        ...[pay?.basic_salary, pay?.housing_allowance, pay?.total_salary]
          .filter((v): v is number => Boolean(v))
          .flatMap((v) => [String(Math.round(Number(v))), Math.round(Number(v)).toLocaleString('en-US')]),
      ].filter((v): v is string => Boolean(v));
      for (const value of forbidden) expect(text, `verify page must not show "${value}"`).not.toContain(value);
      await testInfo.attach('verify.png', { body: await pub.screenshot({ fullPage: true }), contentType: 'image/png' });
      await anon.close();
      for (const a of [emp, hr]) expectHealthy(a, `certificate flow (${locale})`);
      void number;
    } finally {
      await evidence(testInfo, emp, 'employee');
      await evidence(testInfo, hr, 'hr');
      await Promise.all([emp.context.close(), hr.context.close()]);
    }
  });
}
