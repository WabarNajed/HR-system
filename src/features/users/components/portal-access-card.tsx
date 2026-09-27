import { getSessionContext } from '@/lib/auth/session';
import { hasAny } from '@/lib/permissions';
import { getPortalAccess, listRoles, userAbilities } from '../queries';
import { PortalAccessPanel } from './portal-access-panel';

/**
 * Portal access card for an employee profile (cross-module contract — owned by the users module).
 * Shows the linked portal account (e-mail, status, roles, last sign-in) or "No portal access", with
 * Invite (pre-filled with the employee e-mail), Link existing user, Unlink, Enable/Disable sign-in,
 * Resend invitation and Send password reset. Rendered only for viewers with a `users.*` permission;
 * every action is re-checked on the server and in the database.
 */
export async function PortalAccessCard({
  employeeId,
  employeeEmail,
  employeeName,
}: {
  employeeId: string;
  employeeEmail?: string | null;
  employeeName?: string;
}) {
  const ctx = await getSessionContext();
  if (!ctx || !hasAny(ctx, ['users.view', 'users.edit', 'users.create'])) return null;
  let data: { access: Awaited<ReturnType<typeof getPortalAccess>>; roles: Awaited<ReturnType<typeof listRoles>> } | null = null;
  try {
    const [access, roles] = await Promise.all([getPortalAccess(employeeId, ctx), listRoles()]);
    data = { access, roles };
  } catch (error) {
    console.error('[users] portal access card failed:', error instanceof Error ? error.message : error);
  }
  return (
    <PortalAccessPanel
      employeeId={employeeId}
      employeeEmail={employeeEmail ?? null}
      employeeName={employeeName ?? null}
      access={data?.access ?? null}
      roles={data?.roles ?? []}
      abilities={userAbilities(ctx)}
    />
  );
}
