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

/** Sent on every page: shared UI, error mapping, form validation, shell controls. */
export const ROOT_CLIENT_NAMESPACES = ['common', 'errors', 'validation', 'nav'] as const;

/** Added by the (auth) layout: sign in, register, password flows, account status. */
export const AUTH_CLIENT_NAMESPACES = ['auth'] as const;

/**
 * Added by the (app) layout: the authenticated shell (header, search, notification bell, idle guard,
 * account menu) plus `statuses`/`enums`, which nearly every section renders. Each section adds its
 * own namespaces in its `layout.tsx` (`src/app/(app)/<section>/layout.tsx`, `<ClientMessages ns={…}>`),
 * so a page only ships the catalogs of its section; `pnpm check:i18n` verifies each route.
 */
export const APP_CLIENT_NAMESPACES = ['statuses', 'enums', 'search', 'notifications', 'security', 'auth'] as const;
