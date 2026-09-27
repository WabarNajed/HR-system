import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8). Stub: the audit module replaces it.
 * Rendered by the employee profile page for `?tab=` with the employee id.
 */
export async function EmployeeActivityTab({ employeeId }: { employeeId: string }) {
  return <ScaffoldPlaceholder module="audit.employee-tab" key={employeeId} />;
}
