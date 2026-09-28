import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { EmployeeForm } from '@/features/employees/components/employee-form';
import { getMasterDataOptions, getOrgCurrency, getViewer } from '@/features/employees/queries';
import { EMPTY_EMPLOYEE_FORM } from '@/features/employees/schemas';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.header.addEmployee');

export default async function EmployeesNewPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/employees/new']);
  const viewer = await getViewer(ctx);
  // RLS inserts need an organization-scoped `employees.create` (not just the merged permission).
  if (!viewer.orgCan('employees.create')) forbidden();

  const [t, options, currency] = await Promise.all([getTranslations('employees.form'), getMasterDataOptions(ctx.locale), getOrgCurrency()]);

  return (
    <PageStack>
      <PageHeader compact title={t('createTitle')} description={t('createDescription')} className="mx-auto w-full max-w-form" />
      <EmployeeForm
        mode="create"
        employeeId={null}
        defaultValues={EMPTY_EMPLOYEE_FORM}
        options={options}
        currentManager={null}
        permissions={{
          personalEdit: viewer.orgCan('personal_data.edit'),
          personalView: viewer.orgCan('personal_data.view'),
          bankEdit: viewer.orgCan('bank.edit'),
        }}
        currency={currency}
        cancelHref="/employees"
      />
    </PageStack>
  );
}
