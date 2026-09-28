import { z } from 'zod';
import { BODY_MAX, SUBJECT_MAX } from './constants';

const key = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'validation.invalidValue');
const subject = z.string().trim().min(1, 'validation.required').max(SUBJECT_MAX, `validation.maxLength|{"max":${SUBJECT_MAX}}`);
const body = z.string().trim().min(1, 'validation.required').max(BODY_MAX, `validation.maxLength|{"max":${BODY_MAX}}`);

export const saveTemplateSchema = z.object({
  key,
  subjectAr: subject,
  subjectEn: subject,
  bodyAr: body,
  bodyEn: body,
});
export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>;

export const setTemplateActiveSchema = z.object({ key, active: z.boolean() });

export const sendTestSchema = z.object({
  key,
  locale: z.enum(['ar', 'en']),
  subject,
  body,
});

export const providerTestSchema = z.object({ locale: z.enum(['ar', 'en']) });
