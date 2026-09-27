import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * Portal access card for an employee profile (cross-module contract — owned by the users module).
 * Stub: the users module replaces the implementation; keep the export name and props.
 */
export async function PortalAccessCard({
  employeeId,
}: {
  employeeId: string;
  employeeEmail?: string | null;
  employeeName?: string;
}) {
  return <ScaffoldPlaceholder module="users.portal-access" key={employeeId} />;
}
