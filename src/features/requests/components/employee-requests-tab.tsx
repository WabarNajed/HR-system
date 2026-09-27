import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8). Stub: the requests module replaces it.
 * Rendered by the employee profile page for `?tab=` with the employee id.
 */
export async function EmployeeRequestsTab({ employeeId }: { employeeId: string }) {
  return <ScaffoldPlaceholder module="requests.employee-tab" key={employeeId} />;
}
