import { z } from 'zod';

/** Profile (self-service) schemas — isomorphic; messages are i18n keys. */

export const accountDetailsSchema = z.object({
  fullName: z.string().trim().min(2, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
  mobile: z
    .string()
    .trim()
    .max(20, 'validation.maxLength|{"max":20}')
    .refine((v) => v === '' || /^\+?[0-9\s-]{8,20}$/.test(v), 'validation.phone'),
});
export type AccountDetailsInput = z.infer<typeof accountDetailsSchema>;

export const preferencesSchema = z.object({
  language: z.enum(['ar', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;
