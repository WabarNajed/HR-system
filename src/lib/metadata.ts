import 'server-only';

import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { resolveLocale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';

/**
 * Page `<title>` from an i18n key; the root layout's template appends the portal name
 * (`%s · <portal name>`).
 *
 *   export const generateMetadata = () => pageMetadata('nav.items.employees');
 */
export async function pageMetadata(titleKey: string, descriptionKey?: string): Promise<Metadata> {
  const t = getTranslator(resolveLocale(await getLocale()));
  return {
    title: t.has(titleKey) ? t(titleKey) : undefined,
    description: descriptionKey && t.has(descriptionKey) ? t(descriptionKey) : undefined,
  };
}
