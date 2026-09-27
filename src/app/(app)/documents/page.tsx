import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('documents.title');

/** Route scaffold — replaced by the module implementation. */
export default async function DocumentsPage() {
  await requireAccess(ROUTE_ACCESS['/documents']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="documents" title={t('documents.title')} description={t('documents.description')} />;
}
