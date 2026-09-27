import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('dataManagement.title');

/** Route scaffold — replaced by the module implementation. */
export default async function AdminDataManagementPage() {
  await requireAccess(ROUTE_ACCESS['/admin/data-management']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="dataManagement" title={t('dataManagement.title')} description={t('dataManagement.description')} />;
}
