'use server';

import { signIn } from '@/features/auth/actions';

/**
 * Form-action adapter for the sign-in form (`useActionState`). The form posts FormData to this
 * Server Action, so a submit before hydration is still a POST handled on the server — credentials
 * never travel in a URL. Success redirects (thrown by `signIn`); failures return i18n keys.
 */
export type LoginFormState = {
  error: string | null;
  fieldErrors: { email?: string; password?: string };
  /** Echoed back so a failed (possibly no-JS) submit keeps the e-mail; the password never is. */
  email: string;
};

export async function signInWithForm(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const email = text('email').trim().slice(0, 254);
  const next = text('next').slice(0, 500);
  const result = await signIn({ email, password: text('password'), next: next || undefined });
  // `signIn` redirects on success; only failures come back here.
  if (result.ok) return { error: null, fieldErrors: {}, email };
  const fieldErrors: LoginFormState['fieldErrors'] = {};
  if (result.fieldErrors?.email) fieldErrors.email = result.fieldErrors.email;
  if (result.fieldErrors?.password) fieldErrors.password = result.fieldErrors.password;
  return { error: result.error, fieldErrors, email };
}
