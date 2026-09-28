import type { ActionResult } from '@/lib/action';

/**
 * State shared by the progressive-enhancement forms (`useActionState` + Server Action adapters in
 * `form-actions.ts`). Errors and messages are i18n keys. `values` echoes the non-secret inputs so a
 * failed submit (also without JavaScript) keeps what the user typed; passwords are never echoed.
 */
export type FormActionState<V extends string = string, D = null> = {
  status: 'idle' | 'error' | 'success';
  error: string | null;
  message: string | null;
  fieldErrors: Partial<Record<V, string>>;
  values: Partial<Record<V, string>>;
  data: D | null;
  /** Increments with every result, so effects re-run for identical outcomes. */
  seq: number;
};

export function initialFormState<V extends string, D = null>(values: Partial<Record<V, string>> = {}): FormActionState<V, D> {
  return { status: 'idle', error: null, message: null, fieldErrors: {}, values, data: null, seq: 0 };
}

/** Reads the named text fields of a submission (missing / file entries become ''). */
export function readFields<V extends string>(formData: FormData, fields: readonly V[]): Record<V, string> {
  const out = {} as Record<V, string>;
  for (const name of fields) {
    const value = formData.get(name);
    out[name] = typeof value === 'string' ? value : '';
  }
  return out;
}

/** Turns an `ActionResult` into the next form state (`echo` = values safe to send back). */
export function toFormState<V extends string, D>(
  prev: FormActionState<V, D>,
  result: ActionResult<unknown>,
  echo: Partial<Record<V, string>>,
): FormActionState<V, D> {
  if (result.ok) {
    return { status: 'success', error: null, message: result.message ?? null, fieldErrors: {}, values: echo, data: (result.data ?? null) as D | null, seq: prev.seq + 1 };
  }
  return {
    status: 'error',
    error: result.error,
    message: null,
    fieldErrors: (result.fieldErrors ?? {}) as Partial<Record<V, string>>,
    values: echo,
    data: null,
    seq: prev.seq + 1,
  };
}

/* ─── per-form fields & states (the adapters live in the 'use server' file form-actions.ts) ───── */

export const REGISTER_FIELDS = ['fullName', 'employeeNumber', 'email', 'mobile', 'password', 'confirmPassword', 'language'] as const;
export type RegisterField = (typeof REGISTER_FIELDS)[number];
export type RegisterFormState = FormActionState<RegisterField, { needsConfirmation: true; email: string }>;

export type ForgotPasswordFormState = FormActionState<'email', { email: string }>;

export type ResetPasswordFormState = FormActionState<'password' | 'confirmPassword'>;

export const REGISTRATION_DETAILS_FIELDS = ['fullName', 'employeeNumber', 'mobile', 'note'] as const;
export type RegistrationDetailsField = (typeof REGISTRATION_DETAILS_FIELDS)[number];
export type RegistrationDetailsFormState = FormActionState<RegistrationDetailsField>;

export const ACCOUNT_DETAILS_FIELDS = ['fullName', 'mobile'] as const;
export type AccountDetailsFormState = FormActionState<(typeof ACCOUNT_DETAILS_FIELDS)[number]>;

export type ChangePasswordFormState = FormActionState<'currentPassword' | 'password' | 'confirmPassword'>;
