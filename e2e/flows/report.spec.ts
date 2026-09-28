import { expect, test, type Page } from '@playwright/test';
import type { Locale } from '../helpers/auth';
import { actor, evidence, expectHealthy, visit } from '../helpers/flows';
import { escapeRe, tr } from '../helpers/i18n';

/**
 * PRODUCT-SPEC §17 — Report: open a report → apply a filter (the data changes) → export Excel / CSV /
 * PDF (HTTP 200, right content type, CSV with a UTF-8 BOM, the export carries the filter).
 */

async function rowCount(page: Page): Promise<number> {
  const details = page
    .getByRole('region')
    .filter({ has: page.getByRole('heading', { level: 2 }) })
    .last();
  return details.locator('tbody tr').count();
}

async function exportAll(page: Page, locale: Locale, expectInUrl: string) {
  const formats = [
    { label: /xlsx/i, type: 'spreadsheetml', ext: 'xlsx' },
    { label: /csv/i, type: 'text/csv', ext: 'csv' },
    { label: /pdf/i, type: 'application/pdf', ext: 'pdf' },
  ];
  for (const f of formats) {
    await page
      .getByRole('main')
      .getByRole('button', { name: tr(locale, 'reports.view.export'), exact: true })
      .click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/export/') && r.url().includes(`format=${f.ext}`), { timeout: 90_000 }),
      menu.getByRole('menuitem').filter({ hasText: f.label }).click(),
    ]);
    expect(response.status(), `${f.ext} export status`).toBe(200);
    expect(response.headers()['content-type'], `${f.ext} content type`).toContain(f.type);
    expect(response.headers()['content-disposition'] ?? '', `${f.ext} attachment`).toMatch(new RegExp(`attachment;.*\\.${f.ext}`));
    expect(response.url(), `${f.ext} export applies the filter`).toContain(expectInUrl);
    const body = await response.body();
    if (f.ext === 'csv') {
      expect([...body.subarray(0, 3)], 'CSV starts with a UTF-8 BOM').toEqual([0xef, 0xbb, 0xbf]);
    }
    if (f.ext === 'pdf') expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    if (f.ext === 'xlsx') expect(body.subarray(0, 2).toString()).toBe('PK');
  }
}

for (const locale of ['ar', 'en'] as const) {
  test(`[${locale}] employee master report: filter by department → export xlsx/csv/pdf`, async ({ browser }, testInfo) => {
    const hr = await actor(browser, 'hradmin', locale);
    try {
      await visit(hr.page, '/reports/employee-master');
      await expect(hr.page.getByRole('heading', { level: 1 })).toBeVisible();
      const before = await rowCount(hr.page);
      expect(before).toBeGreaterThan(1);

      // Department facet → pick the department of the Operations fixtures.
      await hr.page
        .locator('button[aria-haspopup="dialog"]')
        .filter({ hasText: tr(locale, 'reports.filters.department') })
        .first()
        .click();
      const option = hr.page
        .getByRole('option')
        .filter({ hasText: locale === 'ar' ? /العمليات/ : /QA Operations/ })
        .first();
      await option.click();
      await hr.page.waitForURL(/department=/);
      await hr.page.keyboard.press('Escape');
      await expect.poll(() => rowCount(hr.page), { timeout: 30_000 }).toBeLessThan(before);
      const departmentParam = new URL(hr.page.url()).searchParams.get('department')!;

      await exportAll(hr.page, locale, `department=${departmentParam}`);
      expectHealthy(hr, `employee master report (${locale})`);
    } finally {
      await evidence(testInfo, hr, 'hradmin');
      await hr.context.close();
    }
  });
}

test('[ar] HR requests report: loads, filter by status → export', async ({ browser }, testInfo) => {
  const locale = 'ar' as const;
  const hr = await actor(browser, 'hradmin', locale);
  try {
    await visit(hr.page, '/reports/hr-requests');
    await expect(hr.page.getByRole('heading', { level: 1 }), 'report page renders (no error boundary)').toHaveText(
      tr(locale, 'reports.items.hrRequests.title'),
    );
    const before = await rowCount(hr.page);
    await hr.page
      .locator('button[aria-haspopup="dialog"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRe(tr(locale, 'reports.filters.status'))}`) })
      .first()
      .click();
    await hr.page
      .getByRole('option')
      .filter({ hasText: tr(locale, 'statuses.request.completed') })
      .first()
      .click();
    await hr.page.waitForURL(/status/);
    await hr.page.keyboard.press('Escape');
    await expect.poll(() => rowCount(hr.page), { timeout: 30_000 }).not.toBe(before);
    const statusParam = [...new URL(hr.page.url()).searchParams.entries()].find(([k]) => k.startsWith('status'))!;
    await exportAll(hr.page, locale, `${statusParam[0]}=${statusParam[1]}`);
    expectHealthy(hr, 'hr requests report');
  } finally {
    await evidence(testInfo, hr, 'hradmin');
    await hr.context.close();
  }
});
