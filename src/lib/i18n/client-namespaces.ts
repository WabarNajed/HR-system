/**
 * Which message namespaces are serialized to the browser (ARCHITECTURE §4).
 *
 * Server Components translate with the full catalog (`getTranslations`, request config). Client
 * Components only see what a `NextIntlClientProvider` above them carries, and every namespace sent
 * is part of the HTML/RSC payload of each full page load (the whole Arabic catalog is ~340 KB).
 * So the browser gets:
 *
 *  - root layout ........ `ROOT_CLIENT_NAMESPACES` (every page, incl. public /verify and error pages);
 *  - route layouts ...... + the namespaces they add with `<ClientMessages ns={…}>`
 *                           (`src/lib/i18n/client-messages.tsx`; merged with the parent's messages).
 *
 * `pnpm check:i18n` walks the import graph of every route and fails when a Client Component uses a
 * namespace its route does not provide (`node scripts/check-i18n.mjs --client-usage` lists usage).
 * Keep these lists as plain string arrays (the check reads them statically).
 */

/** Sent on every page: shared UI, error mapping, form validation, shell controls, /verify. */
export const ROOT_CLIENT_NAMESPACES = ['common', 'errors', 'validation', 'nav', 'verify'] as const;

/** Added by the (auth) layout: sign in, register, password flows, account status. */
export const AUTH_CLIENT_NAMESPACES = ['auth'] as const;

/**
 * Added by the (app) layout: the authenticated shell and every module's client islands. Sections
 * may move their namespaces into their own `layout.tsx` (`<ClientMessages ns={['reports']}>`) and
 * drop them here — the check then verifies each section on its own.
 */
export const APP_CLIENT_NAMESPACES = [
  'statuses',
  'enums',
  'search',
  'notifications',
  'security',
  'auth',
  'dashboard',
  'employees',
  'requests',
  'approvals',
  'leave',
  'documents',
  'certificates',
  'templates',
  'reports',
  'profile',
  'settings',
  'users',
  'roles',
  'masterData',
  'requestConfig',
  'emailTemplates',
  'dataManagement',
  'audit',
  'backup',
  'setup',
] as const;
