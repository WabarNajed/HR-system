'use server';

import { requestPasswordReset, signUp, updatePassword } from './actions';
import {
  readFields,
  REGISTER_FIELDS,
  REGISTRATION_DETAILS_FIELDS,
  toFormState,
  type ForgotPasswordFormState,
  type RegisterFormState,
  type RegistrationDetailsFormState,
  type ResetPasswordFormState,
} from './form-state';
import { updateRegistrationDetails } from './registration-actions';

/**
 * FormData adapters of the auth Server Actions for `<form action={serverAction}>` (React renders method="POST") +
 * `useActionState` (progressive enhancement: a submit before hydration or without JavaScript is a
 * real POST handled here). Validation, authorization and redirects stay in the wrapped actions.
 */

/** Self-registration. Redirects to /pending-approval when a session exists; otherwise "check your e-mail". */
export async function registerWithForm(prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  const v = readFields(formData, REGISTER_FIELDS);
  const language = v.language === 'en' ? 'en' : 'ar';
  const result = await signUp({ ...v, language });
  const { password: _password, confirmPassword: _confirm, ...echo } = v;
  return toFormState(prev, result, { ...echo, language });
}

export async function forgotPasswordWithForm(prev: ForgotPasswordFormState, formData: FormData): Promise<ForgotPasswordFormState> {
  const { email } = readFields(formData, ['email'] as const);
  const result = await requestPasswordReset({ email });
  return toFormState(prev, result, { email });
}

export async function resetPasswordWithForm(prev: ResetPasswordFormState, formData: FormData): Promise<ResetPasswordFormState> {
  const v = readFields(formData, ['password', 'confirmPassword'] as const);
  const result = await updatePassword(v);
  return toFormState(prev, result, {});
}

/** Applicant updates / resubmits their registration details (pending-approval page). */
export async function registrationDetailsWithForm(prev: RegistrationDetailsFormState, formData: FormData): Promise<RegistrationDetailsFormState> {
  const v = readFields(formData, REGISTRATION_DETAILS_FIELDS);
  const result = await updateRegistrationDetails(v);
  return toFormState(prev, result, v);
}
