import { z } from 'zod';
import { CERTIFICATE_LANGUAGES, CERTIFICATE_TYPES } from './variables';

/** Certificates module schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const uuid = z.uuid('validation.invalidValue');
const html = (max: number) => z.string().max(max, `validation.maxLength|{"max":${max}}`);

export const templateMetaSchema = z.object({
  name_ar: z.string().trim().min(1, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
  name_en: z.string().trim().min(1, 'validation.required').max(150, 'validation.maxLength|{"max":150}'),
  certificate_type: z.enum(CERTIFICATE_TYPES, 'validation.required'),
  variant: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(60, 'validation.maxLength|{"max":60}'),
  language: z.enum(CERTIFICATE_LANGUAGES, 'validation.required'),
});
export type TemplateMetaInput = z.infer<typeof templateMetaSchema>;

export const templateDraftSchema = templateMetaSchema.extend({
  content_ar: html(200_000),
  content_en: html(200_000),
  header_html: html(50_000),
  footer_html: html(50_000),
  show_logo: z.boolean(),
  show_stamp: z.boolean(),
  show_signature: z.boolean(),
  show_qr: z.boolean(),
});

export const createTemplateSchema = templateMetaSchema.extend({
  sourceId: uuid.nullish(),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const saveTemplateSchema = z.object({
  id: uuid,
  expectedVersion: z.number().int().positive(),
  draft: templateDraftSchema,
  changeNotes: z.string().trim().min(1, 'errors.changeNotesRequired').max(500, 'validation.maxLength|{"max":500}'),
});
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

export const templateIdSchema = z.object({ id: uuid });

export const templateActiveSchema = z.object({ id: uuid, active: z.boolean() });

export const restoreVersionSchema = z.object({
  id: uuid,
  version: z.number().int().positive(),
});

export const previewTemplateSchema = z.object({
  draft: templateDraftSchema,
  employeeId: uuid.nullish(),
  language: z.enum(CERTIFICATE_LANGUAGES),
  includeSalary: z.boolean(),
  includeAllowances: z.boolean(),
  addressedTo: z.string().trim().max(200, 'validation.maxLength|{"max":200}').optional(),
  format: z.enum(['html', 'pdf']),
});
export type PreviewTemplateInput = z.infer<typeof previewTemplateSchema>;

export const employeeSearchSchema = z.object({ q: z.string().trim().max(100) });

export const issueCertificateSchema = z.object({
  requestId: uuid,
  templateId: uuid,
  language: z.enum(CERTIFICATE_LANGUAGES, 'validation.required'),
  addressedTo: z.string().trim().max(200, 'validation.maxLength|{"max":200}').optional(),
  purpose: z.string().trim().max(300, 'validation.maxLength|{"max":300}').optional(),
});
export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;

export const previewCertificateSchema = issueCertificateSchema.extend({ format: z.enum(['html', 'pdf']) });

export const requestIdSchema = z.object({ requestId: uuid });

export const revokeCertificateSchema = z.object({
  id: uuid,
  reason: z.string().trim().min(1, 'validation.required').min(3, 'validation.minLength|{"min":3}').max(500, 'validation.maxLength|{"max":500}'),
});
export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;
