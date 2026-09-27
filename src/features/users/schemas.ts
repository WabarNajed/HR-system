import { z } from 'zod';

/** Users-module form schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const uuid = z.uuid('validation.invalidValue');
const roleKey = z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/, 'validation.invalidValue');

export const inviteUserSchema = z.object({
  email: z.string().trim().min(1, 'validation.required').max(254, 'validation.maxLength|{"max":254}').pipe(z.email('validation.email')),
  fullName: z.string().trim().min(2, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
  roleKeys: z.array(roleKey).min(1, 'validation.selectAtLeastOne').max(10, 'validation.tooManyItems|{"max":10}'),
  employeeId: uuid.nullable().optional(),
  locale: z.enum(['ar', 'en']),
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const setRolesSchema = z.object({
  userId: uuid,
  roleKeys: z.array(roleKey).max(10, 'validation.tooManyItems|{"max":10}'),
});
export type SetRolesInput = z.infer<typeof setRolesSchema>;

export const userIdSchema = z.object({ userId: uuid });

export const setStatusSchema = z.object({ userId: uuid, status: z.enum(['active', 'disabled']) });

export const linkEmployeeSchema = z.object({ userId: uuid, employeeId: uuid });

export const employeeSearchSchema = z.object({ q: z.string().max(100).default('') });

export const approveRegistrationSchema = z.object({
  profileId: uuid,
  employeeId: uuid.nullable(),
  roleKey: roleKey,
  alsoManager: z.boolean().default(false),
});
export type ApproveRegistrationInput = z.infer<typeof approveRegistrationSchema>;

export const reviewNoteSchema = z.object({
  profileId: uuid,
  note: z.string().trim().min(3, 'validation.required').max(1000, 'validation.maxLength|{"max":1000}'),
});
export type ReviewNoteInput = z.infer<typeof reviewNoteSchema>;
