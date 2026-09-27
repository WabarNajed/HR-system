import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (e2e/README.md). They run against an already running app — nothing is started
 * here: `pnpm dev` (or `pnpm build && pnpm start`) plus a Supabase stack with the local QA fixtures
 * (`node scripts/dev/seed-local-fixtures.mjs`).
 *
 *   pnpm e2e                         # all specs
 *   pnpm e2e e2e/auth.spec.ts        # one file
 *   E2E_BASE_URL=http://localhost:3100 pnpm e2e
 */

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
// Pre-installed Chromium (CI sandboxes / this dev container); otherwise Playwright's own browser.
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath, args: ['--no-sandbox'] } };

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  // A dev server compiles routes on first hit (and may be shared), so budgets are generous.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: Number(process.env.E2E_WORKERS ?? 3),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    viewport: { width: 1440, height: 900 },
    navigationTimeout: 120_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath, args: ['--no-sandbox'] },
  },
  projects: [
    // Signs in every fixture role once and stores the sessions in e2e/.auth/<role>.json.
    { name: 'setup', testMatch: /global\.setup\.ts/ },
    // Sign-in flows: sign in themselves, so they don't wait for (or depend on) the setup project.
    { name: 'auth', testMatch: /(auth|language)\.spec\.ts/, use: { ...desktop } },
    // Everything else reuses the stored sessions.
    { name: 'app', testIgnore: /(auth|language)\.spec\.ts|global\.setup\.ts/, use: { ...desktop }, dependencies: ['setup'] },
  ],
});
