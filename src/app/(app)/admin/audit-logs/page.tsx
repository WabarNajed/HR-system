import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('audit.title');

/** Route scaffold — replaced by the module implementation. */
export default async function AdminAuditLogsPage() {
  await requireAccess(ROUTE_ACCESS['/admin/audit-logs']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="audit" title={t('audit.title')} description={t('audit.description')} />;
}
