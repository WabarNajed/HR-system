import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.items.newRequest');

/** Route scaffold — replaced by the module implementation. */
export default async function RequestsNewPage() {
  await requireAccess(ROUTE_ACCESS['/requests/new']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="requests.new" title={t('nav.items.newRequest')} description={t('requests.description')} />;
}
