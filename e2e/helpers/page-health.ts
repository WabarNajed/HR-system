import type { Page } from '@playwright/test';

/** Console noise that is not an application error (dev-server HMR socket, browser extensions…). */
const IGNORED_CONSOLE = [/webpack-hmr|_next\/hmr|turbopack-hmr/i, /Download the React DevTools/i];

export type PageHealth = {
  consoleErrors: string[];
  pageErrors: string[];
  /** Same-origin responses with status >= 500. */
  serverErrors: string[];
  reset: () => void;
};

/**
 * Collects console errors, uncaught page errors and 5xx responses for a page. Expected 4xx responses
 * (e.g. a forbidden page) are reported by the browser as "Failed to load resource" console errors;
 * those are filtered out so only real errors remain.
 */
export function watchPageHealth(page: Page): PageHealth {
  const health: PageHealth = {
    consoleErrors: [],
    pageErrors: [],
    serverErrors: [],
    reset() {
      health.consoleErrors.length = 0;
      health.pageErrors.length = 0;
      health.serverErrors.length = 0;
    },
  };
  const origin = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000').origin;
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    if (/^Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    health.consoleErrors.push(text.slice(0, 600));
  });
  page.on('pageerror', (error) => health.pageErrors.push(String(error).slice(0, 600)));
  page.on('response', (response) => {
    if (response.status() >= 500 && response.url().startsWith(origin)) {
      health.serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return health;
}
