import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.requestTypes');

/** Route scaffold — replaced by the module implementation. */
export default async function SettingsRequestTypesPage() {
  await requireAccess(ROUTE_ACCESS['/settings/request-types']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="settings.requestTypes" title={t('nav.settings.items.requestTypes')} description={t('nav.settings.descriptions.requestTypes')} />;
}
