import 'server-only';

import { headers } from 'next/headers';
import { forbidden, redirect, unstable_rethrow } from 'next/navigation';
import {
  checkAccess,
  hasAny,
  hasRole,
  toPermission,
  type AccessRule,
  type Action,
  type Module,
  type Permission,
  type RoleKey,
} from '@/lib/permissions';
import { PATHNAME_HEADER } from '@/lib/supabase/proxy';
import { getSessionState, type SessionContext } from './session';
import { strictNextPath } from './next-path';

/**
 * Page guards for Server Components (call at the top of a page/layout):
 *
 *   const ctx = await requirePermission('employees', 'view');
 *
 * - Signed out → redirect to `/login?next=<current path>`.
 * - Pending / info requested → `/pending-approval`; disabled / rejected → `/account-disabled`.
 * - Missing permission → `forbidden()` → the (app) segment's `forbidden.tsx` renders the shared
 *   Forbidden state inside the shell (HTTP 403 for non-streamed responses).
 *
 * Server Actions must NOT rely on these redirects — use `requireActionPermission()` from
 * `@/lib/action`, which returns an `errors.forbidden` result instead.
 */

/** Header set by `src/proxy.ts` with the original path + query (for `?next=`). */
export { PATHNAME_HEADER };

export class SessionUnavailableError extends Error {
  constructor(public reason: 'not_configured' | 'backend') {
    super(reason === 'not_configured' ? 'Supabase is not configured.' : 'The authentication backend is unavailable.');
    this.name = 'SessionUnavailableError';
  }
}

/** Only same-origin relative paths are allowed as redirect targets (prevents open redirects). */
export function safeNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  // Delegates to the strict check (control characters, backslashes, other origins and normalized
  // protocol-relative paths are rejected) so every caller — sign-in, /auth/callback, /auth/confirm —
  // shares one open-redirect guard.
  return strictNextPath(value, fallback);
}

async function currentPath(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get(PATHNAME_HEADER);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}

async function loginRedirect(): Promise<never> {
  const path = await currentPath();
  const next = path && path !== '/' && path !== '/dashboard' ? `?next=${encodeURIComponent(safeNextPath(path))}` : '';
  redirect(`/login${next}`);
}

/** Any signed-in user (any profile status). */
export async function requireUser(): Promise<SessionContext> {
  const state = await getSessionState();
  if (state.status === 'unavailable') throw new SessionUnavailableError(state.reason);
  if (state.status === 'anonymous') return loginRedirect();
  return state.ctx;
}

/** Signed-in user whose profile is `active`; other statuses are routed to their status page. */
export async function requireActiveUser(): Promise<SessionContext> {
  const ctx = await requireUser();
  const { status } = ctx.profile;
  if (status === 'active') return ctx;
  if (status === 'pending' || status === 'info_requested') redirect('/pending-approval');
  redirect('/account-disabled');
}

/** Active user with `<module>.<action>` (super admins always pass). */
export async function requirePermission(module: Module, action: Action): Promise<SessionContext> {
  const ctx = await requireActiveUser();
  if (!hasAny(ctx, [toPermission(module, action)])) forbidden();
  return ctx;
}

/** Active user with ANY of the permissions. */
export async function requireAnyPermission(...permissions: Permission[]): Promise<SessionContext> {
  const ctx = await requireActiveUser();
  if (!hasAny(ctx, permissions)) forbidden();
  return ctx;
}

/** Active user with ANY of the roles (super admins always pass). */
export async function requireRole(...roles: RoleKey[]): Promise<SessionContext> {
  const ctx = await requireActiveUser();
  if (!hasRole(ctx, ...roles)) forbidden();
  return ctx;
}

/** Active user matching a declarative rule (used by nav-config / settings-nav routes). */
export async function requireAccess(rule: AccessRule | undefined): Promise<SessionContext> {
  const ctx = await requireActiveUser();
  if (!checkAccess(ctx, rule)) forbidden();
  return ctx;
}
