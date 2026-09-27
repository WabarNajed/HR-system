import { z } from 'zod';

/** Auth form schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const email = z.string().trim().min(1, 'validation.required').max(254, 'validation.maxLength|{"max":254}').pipe(z.email('validation.email'));

/** At least 8 chars incl. a letter and a digit (ARCHITECTURE: validation.passwordRules). */
export const passwordRule = z
  .string()
  .min(8, 'validation.passwordRules')
  .max(72, 'validation.maxLength|{"max":72}')
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'validation.passwordRules');

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
