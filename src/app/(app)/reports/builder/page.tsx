import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.items.reportBuilder');

/** Route scaffold — replaced by the module implementation. */
export default async function ReportsBuilderPage() {
  await requireAccess(ROUTE_ACCESS['/reports/builder']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="reports.builder" title={t('nav.items.reportBuilder')} description={t('reports.description')} />;
}
