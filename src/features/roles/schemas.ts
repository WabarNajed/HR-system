import { z } from 'zod';
import { ALL_PERMISSIONS } from '@/lib/permissions';

/** Roles-module schemas (isomorphic). Messages are i18n keys. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `validation.maxLength|{"max":${max}}`)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const roleDetailsSchema = z
  .object({
    nameAr: z.string().trim().max(80, 'validation.maxLength|{"max":80}'),
    nameEn: z.string().trim().max(80, 'validation.maxLength|{"max":80}'),
    descriptionAr: optionalText(300),
    descriptionEn: optionalText(300),
    dataScope: z.enum(['own', 'team', 'organization']),
  })
  .refine((v) => v.nameAr.length > 0 || v.nameEn.length > 0, { path: ['nameAr'], message: 'validation.atLeastOneName' });
export type RoleDetailsInput = z.input<typeof roleDetailsSchema>;

export const createRoleSchema = roleDetailsSchema.and(
  z.object({ copyFromRoleId: z.uuid('validation.invalidValue').nullable().optional() }),
);
export type CreateRoleInput = z.input<typeof createRoleSchema>;

export const updateRoleSchema = roleDetailsSchema.and(z.object({ roleId: z.uuid('validation.invalidValue') }));
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;

export const deleteRoleSchema = z.object({ roleId: z.uuid('validation.invalidValue') });

export const savePermissionsSchema = z.object({
  roleId: z.uuid('validation.invalidValue'),
  permissions: z.array(z.enum(ALL_PERMISSIONS as unknown as [string, ...string[]])).max(ALL_PERMISSIONS.length),
});
export type SavePermissionsInput = z.infer<typeof savePermissionsSchema>;
