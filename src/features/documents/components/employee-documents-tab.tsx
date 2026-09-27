import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Employee profile tab (extension point — ARCHITECTURE §8). Stub: the documents module replaces it.
 * Rendered by the employee profile page for `?tab=` with the employee id.
 */
export async function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  return <ScaffoldPlaceholder module="documents.employee-tab" key={employeeId} />;
}
