import 'server-only';

import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { correlationId, logAndMapError } from '@/lib/errors';
import { checkAccess, hasAny, type AccessRule, type Permission } from '@/lib/permissions';

/**
 * Server Action contract (ARCHITECTURE §8):
 *
 *   ActionResult<T> = { ok: true, data?: T, message?: string }
 *                   | { ok: false, error: string, fieldErrors?: Record<string, string> }
 *
 * `error`, `message` and every `fieldErrors` value are i18n keys (optionally with JSON params,
 * e.g. `validation.maxLength|{"max":500}` — `FormMessage` / `useErrorMessage` understand both).
 *
 *   // features/<module>/actions.ts
 *   'use server';
 *   export const saveDepartment = withAction(departmentSchema, async (input, { ctx }) => {
 *     requirePermissionIn(ctx, 'settings.edit');
 *     const supabase = await createClient();
 *     const { error } = await supabase.from('departments').upsert(input);
 *     if (error) throw error;                    // mapped via lib/errors.ts
 *     revalidatePath('/settings/departments');
 *     return ok(undefined, 'masterData.toast.saved');
 *   }, { auth: 'active', scope: 'departments.save' });
 */

export type ActionSuccess<T> = { ok: true; data?: T; message?: string };
export type ActionFailure = { ok: false; error: string; fieldErrors?: Record<string, string> };
export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;

export function ok<T = void>(data?: T, message?: string): ActionSuccess<T> {
  const result: ActionSuccess<T> = { ok: true };
  if (data !== undefined) result.data = data;
  if (message) result.message = message;
  return result;
}

export function fail(error = 'errors.generic', fieldErrors?: Record<string, string>): ActionFailure {
  return fieldErrors && Object.keys(fieldErrors).length ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/** Throw inside a handler to return a specific i18n error key (no logging noise). */
export class ActionError extends Error {
  constructor(
    public key: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(key);
    this.name = 'ActionError';
  }
}

/** Throws `errors.forbidden` unless the context has the permission (super admins pass). */
export function requirePermissionIn(ctx: SessionContext, ...permissions: Permission[]): void {
  if (!hasAny(ctx, permissions)) throw new ActionError('errors.forbidden');
}

/** Throws `errors.forbidden` unless the context satisfies the access rule. */
export function requireAccessIn(ctx: SessionContext, rule: AccessRule): void {
  if (!checkAccess(ctx, rule)) throw new ActionError('errors.forbidden');
}

/** Session for actions: active user or an `ActionError` (never redirects). */
export async function requireActionSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw new ActionError('errors.sessionExpired');
  if (ctx.profile.status !== 'active') throw new ActionError('errors.forbidden');
  return ctx;
}

/** Convenience: active session + permission check in one call. */
export async function requireActionPermission(...permissions: Permission[]): Promise<SessionContext> {
  const ctx = await requireActionSession();
  requirePermissionIn(ctx, ...permissions);
  return ctx;
}

/* ─── zod → field error keys ──────────────────────────────────────────────── */

const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+(\|.*)?$/;

type Issue = z.core.$ZodIssue;

function issueToKey(issue: Issue): string {
  if (issue.message && KEY_RE.test(issue.message)) return issue.message;
  switch (issue.code) {
    case 'invalid_type':
      return (issue as { input?: unknown }).input === undefined || (issue as { input?: unknown }).input === null
        ? 'validation.required'
        : 'validation.invalidValue';
    case 'too_small': {
      const i = issue as { origin?: string; minimum?: number | bigint };
      const min = Number(i.minimum ?? 0);
      if (i.origin === 'string') return min <= 1 ? 'validation.required' : `validation.minLength|${JSON.stringify({ min })}`;
      if (i.origin === 'array' || i.origin === 'set') return min <= 1 ? 'validation.selectAtLeastOne' : 'validation.invalidValue';
      return `validation.min|${JSON.stringify({ min })}`;
    }
    case 'too_big': {
      const i = issue as { origin?: string; maximum?: number | bigint };
      const max = Number(i.maximum ?? 0);
      if (i.origin === 'string') return `validation.maxLength|${JSON.stringify({ max })}`;
      if (i.origin === 'array' || i.origin === 'set') return `validation.tooManyItems|${JSON.stringify({ max })}`;
      return `validation.max|${JSON.stringify({ max })}`;
    }
    case 'invalid_format': {
      const format = (issue as { format?: string }).format;
      if (format === 'email') return 'validation.email';
      if (format === 'url') return 'validation.url';
      if (format === 'date' || format === 'datetime') return 'validation.invalidDate';
      if (format === 'time') return 'validation.invalidTime';
      return 'validation.pattern';
    }
    case 'invalid_value':
    case 'invalid_union':
      return 'validation.invalidValue';
    default:
      return 'validation.invalidValue';
  }
}

/** Flattens zod issues to `{ "field.path": "validation.key" }` (first issue per path wins). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join('.') || '_root';
    if (!(path in out)) out[path] = issueToKey(issue);
  }
  return out;
}

/* ─── withAction ──────────────────────────────────────────────────────────── */

export type ActionMeta = {
  /** Correlation id included in server logs for this invocation. */
  correlationId: string;
  /** Session context when `auth` is not `'none'`. */
  ctx: SessionContext;
};

type WithActionOptions = {
  /** `'active'` (default): requires an active signed-in user. `'none'`: public action (ctx is null). */
  auth?: 'active' | 'none';
  /** Label used in server logs (defaults to `action`). */
  scope?: string;
};

type Handler<I, T, A extends 'active' | 'none'> = (
  input: I,
  meta: A extends 'none' ? Omit<ActionMeta, 'ctx'> & { ctx: SessionContext | null } : ActionMeta,
) => Promise<ActionResult<T>>;

/**
 * Wraps a Server Action: validates input with zod (field errors as i18n keys), resolves the
 * session, catches everything (Next redirects/notFound are re-thrown), maps errors to i18n keys
 * via `lib/errors.ts` and logs raw errors server-side with a correlation id. Never leaks raw errors.
 */
export function withAction<S extends z.ZodType, T = void, A extends 'active' | 'none' = 'active'>(
  schema: S,
  handler: Handler<z.infer<S>, T, A>,
  options: WithActionOptions & { auth?: A } = {},
): (input: z.input<S>) => Promise<ActionResult<T>> {
  const scope = options.scope ?? 'action';
  return async (input: z.input<S>) => {
    const cid = correlationId();
    try {
      const parsed = await schema.safeParseAsync(input);
      if (!parsed.success) return fail('errors.validation', zodFieldErrors(parsed.error));

      let ctx: SessionContext | null = null;
      if (options.auth !== 'none') {
        ctx = await requireActionSession();
      } else {
        ctx = await getSessionContext();
      }
      return await handler(parsed.data, { correlationId: cid, ctx } as Parameters<typeof handler>[1]);
    } catch (error) {
      unstable_rethrow(error);
      if (error instanceof ActionError) return fail(error.key, error.fieldErrors);
      return fail(logAndMapError(scope, error, cid));
    }
  };
}

/**
 * Runs an arbitrary async block with the same error handling as `withAction` (no schema/auth).
 * Useful inside actions with custom signatures (e.g. FormData).
 */
export async function safeAction<T>(scope: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  const cid = correlationId();
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ActionError) return fail(error.key, error.fieldErrors);
    return fail(logAndMapError(scope, error, cid));
  }
}
