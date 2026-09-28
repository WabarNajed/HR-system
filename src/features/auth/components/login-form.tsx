/**
 * The sign-in form lives in `src/app/(auth)/login/login-form.tsx` (progressive `useActionState` form,
 * integration module). This module only keeps the notice type that the login page and form import.
 */
export type LoginNotice = 'sessionExpired' | 'linkExpired' | 'passwordUpdated' | 'signedOut';
