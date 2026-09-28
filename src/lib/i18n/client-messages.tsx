import 'server-only';

import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ROOT_CLIENT_NAMESPACES } from './client-namespaces';
import { resolveLocale } from './config';
import { ExtendMessages } from './extend-messages';
import { pickNamespaces, type Namespace } from './messages';

const ROOT = new Set<string>(ROOT_CLIENT_NAMESPACES);

/**
 * Server Component: makes `ns` available to the Client Components below it (in addition to the
 * root layout's `ROOT_CLIENT_NAMESPACES` and any `ClientMessages` above). Use it in route layouts
 * or pages around client islands; keep `ns` an array literal or a list from `client-namespaces.ts`
 * so `pnpm check:i18n` can verify coverage.
 */
export async function ClientMessages({ ns, children }: { ns: readonly Namespace[]; children: ReactNode }) {
  const extra = ns.filter((n) => !ROOT.has(n));
  if (!extra.length) return <>{children}</>;
  const locale = resolveLocale(await getLocale());
  return <ExtendMessages messages={pickNamespaces(locale, extra)}>{children}</ExtendMessages>;
}
