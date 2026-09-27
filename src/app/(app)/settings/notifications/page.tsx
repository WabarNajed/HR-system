import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.notifications');

/** Route scaffold — replaced by the module implementation. */
export default async function SettingsNotificationsPage() {
  await requireAccess(ROUTE_ACCESS['/settings/notifications']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="settings.notifications" title={t('nav.settings.items.notifications')} description={t('nav.settings.descriptions.notifications')} />;
}
