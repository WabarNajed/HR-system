import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('profile.title');

/** Route scaffold — replaced by the module implementation. */
export default async function ProfilePage() {
  await requireAccess(ROUTE_ACCESS['/profile']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="profile" title={t('profile.title')} description={t('profile.description')} />;
}
