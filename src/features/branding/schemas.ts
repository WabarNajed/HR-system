import { z } from 'zod';
import { BRAND_IMAGE_KINDS } from './image-kinds';

/** Branding schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const text = (max: number) => z.string().trim().max(max, `validation.maxLength|{"max":${max}}`);
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'validation.hexColor');

export const brandingFormSchema = z
  .object({
    portalNameAr: text(80),
    portalNameEn: text(80),
    primaryColor: hex,
    secondaryColor: hex,
    loginTitleAr: text(120),
    loginTitleEn: text(120),
    loginSubtitleAr: text(300),
    loginSubtitleEn: text(300),
    signatoryNameAr: text(120),
    signatoryNameEn: text(120),
    signatoryTitleAr: text(120),
    signatoryTitleEn: text(120),
  })
  .refine((v) => Boolean(v.portalNameAr || v.portalNameEn), { path: ['portalNameAr'], message: 'validation.atLeastOneName' });

export type BrandingFormValues = z.infer<typeof brandingFormSchema>;

export const setBrandImageSchema = z.object({
  kind: z.enum(BRAND_IMAGE_KINDS),
  path: z.string().trim().max(200).nullable(),
});
export type SetBrandImageInput = z.infer<typeof setBrandImageSchema>;
