import type { Metadata } from 'next';
import { forbidden, notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { pageMetadata } from '@/lib/metadata';
import { EmployeeForm } from '@/features/employees/components/employee-form';
import { isUuid } from '@/features/employees/directory-params';
import { toEmployeeFormValues } from '@/features/employees/form-values';
import {
  getBankAccountForEdit,
  getCompensation,
  getEmployeeRecord,
  getManagerCard,
  getMasterDataOptions,
  getOrgCurrency,
  getViewer,
} from '@/features/employees/queries';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('employees.form.editTitle');

export default async function EmployeesIdEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/employees/[id]/edit']);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const viewer = await getViewer(ctx);
  // RLS updates need an organization-scoped `employees.edit`.
  if (!viewer.orgCan('employees.edit')) forbidden();

  const loaded = await getEmployeeRecord(id, viewer);
  if (!loaded) notFound();
  const { employee } = loaded;
  const bankEdit = viewer.orgCan('bank.edit');

  const [t, options, currency, manager, compensation, bank] = await Promise.all([
    getTranslations('employees.form'),
    getMasterDataOptions(ctx.locale, {
      departments: employee.department_id,
      jobTitles: employee.job_title_id,
      locations: employee.location_id,
      costCenters: employee.cost_center_id,
    }),
    getOrgCurrency(),
    employee.manager_id ? getManagerCard(id) : Promise.resolve(null),
    bankEdit ? getCompensation(id) : Promise.resolve(null),
    bankEdit ? getBankAccountForEdit(id) : Promise.resolve(null),
  ]);
  const name = employeeDisplayName(employee, ctx.locale);

  return (
    <PageStack>
      <BreadcrumbLabel label={name} path={`/employees/${id}`} />
      <PageHeader title={t('editTitle')} description={name || t('editDescription')} className="mx-auto w-full max-w-form" />
      <EmployeeForm
        mode="edit"
        employeeId={id}
        defaultValues={toEmployeeFormValues(employee, compensation, bank)}
        options={options}
        currentManager={manager}
        permissions={{
          personalEdit: viewer.orgCan('personal_data.edit'),
          personalView: viewer.orgCan('personal_data.view'),
          bankEdit,
        }}
        currency={currency}
        cancelHref={`/employees/${id}`}
      />
    </PageStack>
  );
}
