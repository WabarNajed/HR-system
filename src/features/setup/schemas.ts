import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max, `validation.maxLength|{"max":${max}}`);

export const setupOrganizationSchema = z
  .object({
    nameAr: text(200),
    nameEn: text(200),
    legalNameAr: text(200),
    legalNameEn: text(200),
    hrEmail: text(254).refine((v) => v === '' || z.email().safeParse(v).success, 'validation.email'),
    phone: text(30).refine((v) => v === '' || /^\+?[0-9\s()-]{6,30}$/.test(v), 'validation.invalidValue'),
    city: text(100),
  })
  .refine((v) => Boolean(v.nameAr || v.nameEn), { path: ['nameAr'], message: 'validation.atLeastOneName' });
export type SetupOrganizationValues = z.infer<typeof setupOrganizationSchema>;

export const completeSetupSchema = z.object({ confirm: z.literal(true) });
