import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('reports.title');

/** Route scaffold — replaced by the module implementation. */
export default async function ReportsPage() {
  await requireAccess(ROUTE_ACCESS['/reports']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="reports" title={t('reports.title')} description={t('reports.description')} />;
}
