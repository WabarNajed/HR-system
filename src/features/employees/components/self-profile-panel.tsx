import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';

/**
 * The signed-in employee's own information (cross-module contract — owned by the employees module).
 * Stub: the employees module replaces the implementation; keep the export name and props.
 */
export async function SelfProfilePanel({ employeeId }: { employeeId: string | null }) {
  return <ScaffoldPlaceholder module="employees.self-profile" key={employeeId ?? 'none'} />;
}
