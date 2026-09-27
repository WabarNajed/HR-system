import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('dashboard.title');

/** Route scaffold — replaced by the module implementation. */
export default async function DashboardPage() {
  await requireAccess(ROUTE_ACCESS['/dashboard']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="dashboard" title={t('dashboard.title')} description={t('dashboard.description')} showHomeLink={false} />;
}
