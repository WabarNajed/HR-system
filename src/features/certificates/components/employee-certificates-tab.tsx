import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8). Stub: the certificates module replaces it.
 * Rendered by the employee profile page for `?tab=` with the employee id.
 */
export async function EmployeeCertificatesTab({ employeeId }: { employeeId: string }) {
  return <ScaffoldPlaceholder module="certificates.employee-tab" key={employeeId} />;
}
