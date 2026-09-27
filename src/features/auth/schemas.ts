import { z } from 'zod';

/** Auth form schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const email = z.string().trim().min(1, 'validation.required').max(254, 'validation.maxLength|{"max":254}').pipe(z.email('validation.email'));

/**
 * Password policy — mirrors Supabase Auth (`minimum_password_length = 8`,
 * `password_requirements = "lower_upper_letters_digits"`): ≥ 8 characters with an uppercase letter,
 * a lowercase letter and a digit. The server enforces it again.
 */
export const PASSWORD_CHECKS = {
  length: (v: string) => v.length >= 8,
  upper: (v: string) => /[A-Z]/.test(v),
  lower: (v: string) => /[a-z]/.test(v),
  digit: (v: string) => /\d/.test(v),
} as const;
export type PasswordCheck = keyof typeof PASSWORD_CHECKS;

export function passwordMeetsPolicy(value: string): boolean {
  return (Object.keys(PASSWORD_CHECKS) as PasswordCheck[]).every((k) => PASSWORD_CHECKS[k](value));
}

export const passwordRule = z
  .string()
  .min(8, 'auth.password.rulesError')
  .max(72, 'validation.maxLength|{"max":72}')
  .refine(passwordMeetsPolicy, 'auth.password.rulesError');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'validation.required').max(200, 'validation.maxLength|{"max":200}'),
  next: z.string().max(500).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
    employeeNumber: z.string().trim().min(1, 'validation.required').max(50, 'validation.maxLength|{"max":50}'),
    email,
    mobile: z
      .string()
      .trim()
      .min(1, 'validation.required')
      .max(20, 'validation.maxLength|{"max":20}')
      .regex(/^\+?[0-9\s-]{8,20}$/, 'validation.phone'),
    password: passwordRule,
    confirmPassword: z.string().min(1, 'validation.required'),
    language: z.enum(['ar', 'en']),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordsMismatch' });
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordRule,
    confirmPassword: z.string().min(1, 'validation.required'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordsMismatch' });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Applicant answering HR's information request (pending-approval page). */
export const registrationDetailsSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
  employeeNumber: z.string().trim().min(1, 'validation.required').max(50, 'validation.maxLength|{"max":50}'),
  mobile: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(20, 'validation.maxLength|{"max":20}')
    .regex(/^\+?[0-9\s-]{8,20}$/, 'validation.phone'),
  note: z.string().trim().max(1000, 'validation.maxLength|{"max":1000}').optional(),
});
export type RegistrationDetailsInput = z.infer<typeof registrationDetailsSchema>;

/** Profile › Account & security: change password (re-authenticates with the current one). */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'validation.required').max(200, 'validation.maxLength|{"max":200}'),
    password: passwordRule,
    confirmPassword: z.string().min(1, 'validation.required'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordsMismatch' })
  .refine((v) => v.password !== v.currentPassword, { path: ['password'], message: 'errors.samePassword' });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
