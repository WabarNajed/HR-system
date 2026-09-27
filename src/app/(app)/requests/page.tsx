import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('requests.title');

/** Route scaffold — replaced by the module implementation. */
export default async function RequestsPage() {
  await requireAccess(ROUTE_ACCESS['/requests']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="requests" title={t('requests.title')} description={t('requests.description')} />;
}
