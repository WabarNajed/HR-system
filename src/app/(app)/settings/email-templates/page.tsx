import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.emailTemplates');

/** Route scaffold — replaced by the module implementation. */
export default async function SettingsEmailTemplatesPage() {
  await requireAccess(ROUTE_ACCESS['/settings/email-templates']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="settings.emailTemplates" title={t('nav.settings.items.emailTemplates')} description={t('nav.settings.descriptions.emailTemplates')} />;
}
