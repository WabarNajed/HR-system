import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8). Stub: the leave module replaces it.
 * Rendered by the employee profile page for `?tab=` with the employee id.
 */
export async function EmployeeLeaveTab({ employeeId }: { employeeId: string }) {
  return <ScaffoldPlaceholder module="leave.employee-tab" key={employeeId} />;
}
