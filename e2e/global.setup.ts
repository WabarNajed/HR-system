import fs from 'node:fs';
import { expect, test as setup } from '@playwright/test';
import { login } from './helpers/auth';
import { SESSION_ROLES, storageStatePath } from './helpers/users';

/** Signs in each fixture role once; specs reuse the sessions via `test.use({ storageState })`. */
fs.mkdirSync('e2e/.auth', { recursive: true });

for (const role of SESSION_ROLES) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await login(page, role, { locale: 'ar' });
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().storageState({ path: storageStatePath(role) });
  });
}
