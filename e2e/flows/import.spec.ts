import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { expect, test } from '@playwright/test';
import { expectDocumentLocale } from '../helpers/auth';
import { actor, evidence, expectHealthy, rest, visit, workDir } from '../helpers/flows';
import { escapeRe, exact, tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Import: download the Employees template → fill 3 rows (Arabic names; one invalid
 * email; one duplicate Iqama) → upload → validation shows the warning / error → import the valid rows →
 * the new employees appear in the directory and in global search. Arabic UI (HR admin).
 */

const locale = 'ar' as const;

test('[ar] employees import: template → 3 rows → validate → import → directory + search', async ({ browser }, testInfo) => {
  const hr = await actor(browser, 'hradmin', locale);
  const tag = String(Date.now()).slice(-6);
  const rowsIn = [
    { number: `QAF2-${tag}-1`, ar: `موظف اختبار ${tag} أول`, en: `QA F2 Import ${tag} A`, iqama: `2${tag}001`, email: `qaf2-${tag}-a@qa.hr.local` },
    { number: `QAF2-${tag}-2`, ar: `موظفة اختبار ${tag} ثانية`, en: `QA F2 Import ${tag} B`, iqama: `2${tag}002`, email: 'بريد-غير-صالح' },
    { number: `QAF2-${tag}-3`, ar: `موظف اختبار ${tag} ثالث`, en: `QA F2 Import ${tag} C`, iqama: `2${tag}001`, email: `qaf2-${tag}-c@qa.hr.local` },
  ];
  try {
    // 1. Download the template from the import page.
    await visit(hr.page, '/admin/data-management/import?type=employees');
    await expectDocumentLocale(hr.page, locale);
    const [download] = await Promise.all([
      hr.page.waitForEvent('download'),
      hr.page.locator('a[href="/api/data-management/templates/employees"]').first().click(),
    ]);
    // (The Arabic RFC 5987 file name is not representable in this container's C locale, so Chromium
    // may suggest "download" — check the content instead of the name.)
    const templatePath = path.join(workDir(testInfo), 'template.xlsx');
    await download.saveAs(templatePath);
    expect(fs.readFileSync(templatePath).subarray(0, 2).toString(), 'template is an xlsx (zip) file').toBe('PK');

    // 2. Fill three rows under the template's example row, matching columns by their (Arabic) headers.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fs.readFileSync(templatePath) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const header = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? '').trim());
    const col = (label: string) => {
      const i = header.indexOf(label);
      if (i < 1) throw new Error(`template column "${label}" not found in ${header.join(' | ')}`);
      return i;
    };
    const cNumber = col('الرقم الوظيفي');
    const cAr = col('اسم الموظف (عربي)');
    const cEn = col('اسم الموظف (إنجليزي)');
    const cId = col('رقم الإقامة / الهوية');
    const cEmail = col('البريد الإلكتروني');
    rowsIn.forEach((r, i) => {
      const row = ws.getRow(3 + i);
      row.getCell(cNumber).value = r.number;
      row.getCell(cAr).value = r.ar;
      row.getCell(cEn).value = r.en;
      row.getCell(cId).value = r.iqama;
      row.getCell(cEmail).value = r.email;
      row.commit();
    });
    const filled = path.join(workDir(testInfo), `qa-f2-employees-${tag}.xlsx`);
    await wb.xlsx.writeFile(filled);

    // 3. Upload → sheet/header → mapping → check rows.
    await hr.page.locator('input[type=file]').setInputFiles(filled);
    await expect(hr.page.getByRole('heading', { name: tr(locale, 'dataManagement.wizard.sheet.title') })).toBeVisible({ timeout: 60_000 });
    await hr.page.getByRole('button', { name: exact(tr(locale, 'dataManagement.wizard.next')) }).click();
    await expect(hr.page.getByRole('heading', { name: tr(locale, 'dataManagement.wizard.mapping.title') })).toBeVisible();
    await hr.page.getByRole('button', { name: exact(tr(locale, 'dataManagement.wizard.mapping.validate')) }).click();
    await expect(hr.page.getByRole('heading', { name: tr(locale, 'dataManagement.wizard.review.title') })).toBeVisible({ timeout: 90_000 });

    // 4. Validation: the invalid email and the duplicate Iqama are reported on their rows.
    const main = hr.page.getByRole('main');
    const rowOf = (r: (typeof rowsIn)[number]) => main.getByRole('row').filter({ hasText: r.number });
    const invalidEmail = tr(locale, 'dataManagement.issues.invalidEmail', { field: tr(locale, 'dataManagement.fields.company_email'), value: rowsIn[1]!.email });
    await expect(rowOf(rowsIn[1]!), 'invalid email is flagged').toContainText(invalidEmail);
    await expect(rowOf(rowsIn[2]!), 'duplicate Iqama is flagged').toContainText(rowsIn[2]!.iqama);
    await testInfo.attach('review.png', { body: await hr.page.screenshot({ fullPage: true }), contentType: 'image/png' });
    const rowB = await rowOf(rowsIn[1]!).innerText();
    const rowC = await rowOf(rowsIn[2]!).innerText();
    const rowCStatus = rowC.split('\n').map((s) => s.trim()).filter(Boolean);
    testInfo.annotations.push({ type: 'row C (duplicate Iqama)', description: rowCStatus.join(' | ') });
    testInfo.annotations.push({ type: 'row B (invalid email)', description: rowB.replace(/\s+/g, ' ') });

    // 5. Import the valid rows.
    const start = hr.page.getByRole('button', { name: new RegExp(escapeRe(tr(locale, 'dataManagement.wizard.review.startImport', { count: 'X' })).replace('X', '\\d+')) });
    await expect(start).toBeEnabled();
    await start.click();
    const confirm = hr.page.getByRole('alertdialog').or(hr.page.getByRole('dialog'));
    await confirm.getByRole('button', { name: exact(tr(locale, 'dataManagement.wizard.review.confirm')) }).click();
    await expect(hr.page.getByRole('heading', { name: new RegExp(`${escapeRe(tr(locale, 'dataManagement.wizard.run.doneTitle'))}|${escapeRe(tr(locale, 'dataManagement.wizard.run.failedTitle'))}`) })).toBeVisible({ timeout: 120_000 });

    const created = await rest<{ employee_number: string; name_ar: string; company_email: string | null; national_id: string }[]>(
      `employees?select=employee_number,name_ar,company_email,national_id&employee_number=like.QAF2-${tag}-*`,
    );
    const numbers = created.map((e) => e.employee_number).sort();
    testInfo.annotations.push({ type: 'imported', description: JSON.stringify(created) });
    expect(numbers, 'row A imported').toContain(rowsIn[0]!.number);
    expect(numbers, 'row B imported with the invalid email left empty').toContain(rowsIn[1]!.number);
    expect(created.find((e) => e.employee_number === rowsIn[1]!.number)?.company_email ?? null).toBeNull();
    expect(numbers, 'row C (duplicate Iqama) must not create a second employee with the same Iqama').not.toContain(rowsIn[2]!.number);

    // 6. Directory + global search.
    await visit(hr.page, `/employees?q=${encodeURIComponent(rowsIn[0]!.ar)}`);
    await expect(hr.page.getByRole('main').getByText(rowsIn[0]!.ar).first()).toBeVisible();
    await hr.page.locator('header').getByRole('button', { name: tr(locale, 'nav.header.openSearch') }).first().click();
    const dialog = hr.page.getByRole('dialog');
    await dialog.getByRole('combobox').or(dialog.locator('input')).first().fill(rowsIn[1]!.ar);
    const hit = dialog.getByRole('option').filter({ hasText: rowsIn[1]!.ar }).first();
    await expect(hit).toBeVisible({ timeout: 30_000 });
    await hit.click();
    await hr.page.waitForURL(/\/employees\/[0-9a-f-]{36}/);
    await expect(hr.page.getByRole('main').getByText(rowsIn[1]!.ar).first()).toBeVisible();
    expectHealthy(hr, 'import flow');
  } finally {
    await evidence(testInfo, hr, 'hradmin');
    await hr.context.close();
  }
});
