import { z } from 'zod';

/** Settings › Organization schema (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const text = (max: number) => z.string().trim().max(max, `validation.maxLength|{"max":${max}}`);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const day = z.number().int().min(0).max(6);

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const organizationFormSchema = z
  .object({
    nameAr: text(200),
    nameEn: text(200),
    legalNameAr: text(200),
    legalNameEn: text(200),
    addressAr: text(500),
    addressEn: text(500),
    city: text(100),
    country: z.string().trim().regex(/^([A-Z]{2})?$/, 'validation.invalidValue'),
    website: text(200).refine(
      (v) => v === '' || /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v),
      'validation.url',
    ),
    phone: text(30).refine((v) => v === '' || /^\+?[0-9\s()-]{6,30}$/.test(v), 'settings.organization.validation.phone'),
    hrEmail: text(254).refine((v) => v === '' || z.email().safeParse(v).success, 'validation.email'),
    commercialRegistration: text(30).refine((v) => v === '' || /^[0-9A-Za-z-]{4,30}$/.test(v), 'settings.organization.validation.registration'),
    vatNumber: text(30).refine((v) => v === '' || /^[0-9A-Za-z-]{5,30}$/.test(v), 'settings.organization.validation.vat'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'validation.invalidValue'),
    timezone: z.string().min(1, 'validation.required').max(64),
    defaultLanguage: z.enum(['ar', 'en']),
    fiscalYearStartMonth: z.number().int().min(1).max(12),
    workingDays: z.array(day).min(1, 'settings.organization.validation.workingDays'),
    weekendDays: z.array(day),
    workStart: z.string().regex(TIME, 'validation.invalidTime'),
    workEnd: z.string().regex(TIME, 'validation.invalidTime'),
  })
  .refine((v) => Boolean(v.nameAr || v.nameEn), { path: ['nameAr'], message: 'validation.atLeastOneName' })
  .refine((v) => !v.workingDays.some((d) => v.weekendDays.includes(d)), {
    path: ['weekendDays'],
    message: 'settings.organization.validation.dayOverlap',
  })
  .refine((v) => v.workEnd > v.workStart, { path: ['workEnd'], message: 'settings.organization.validation.workHours' });

export type OrganizationFormValues = z.infer<typeof organizationFormSchema>;

/** `example.com` → `https://example.com` (stored links always carry a scheme). */
export function normalizeWebsite(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
