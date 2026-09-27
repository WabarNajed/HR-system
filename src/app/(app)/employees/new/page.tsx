import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.header.addEmployee');

/** Route scaffold — replaced by the module implementation. */
export default async function EmployeesNewPage() {
  await requireAccess(ROUTE_ACCESS['/employees/new']);
  const t = await getTranslations();
  return <ScaffoldPlaceholder module="employees.new" title={t('nav.header.addEmployee')} description={t('employees.description')} />;
}
