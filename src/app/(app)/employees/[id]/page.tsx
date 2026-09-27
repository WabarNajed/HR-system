import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('employees.title');

/** Route scaffold — replaced by the module implementation. */
export default async function EmployeesIdPage() {
  await requireAccess(ROUTE_ACCESS['/employees/[id]']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="employees.profile" title={t('employees.title')} description={t('employees.description')} />;
}
