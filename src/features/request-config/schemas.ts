import { z } from 'zod';
import { REQUEST_FIELD_TYPES } from '@/features/requests/types';
import { STEP_TYPES } from './types';

/** Request configuration schemas (isomorphic). Messages are i18n keys resolved by `FormMessage`. */

const KEY_RE = /^[a-z][a-z0-9_]{0,62}$/;
const text = (max: number) => z.string().trim().max(max, `validation.maxLength|{"max":${max}}`);
const requiredText = (max: number) => text(max).min(1, 'validation.required');
const guid = z.guid('validation.invalidValue');

export const requestTypeFormSchema = z.object({
  key: z.string().trim().regex(KEY_RE, 'requestConfig.validation.key'),
  category: z.string().trim().regex(KEY_RE, 'validation.invalidValue'),
  nameAr: requiredText(120),
  nameEn: requiredText(120),
  descriptionAr: text(500),
  descriptionEn: text(500),
  icon: z.string().trim().min(1, 'validation.required').max(64),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'validation.invalidValue')
    .nullable(),
  slaBusinessDays: z.number().int('validation.invalidValue').min(0, 'validation.min|{"min":0}').max(365, 'validation.max|{"max":365}').nullable(),
  sortOrder: z.number().int('validation.invalidValue').min(0, 'validation.min|{"min":0}').max(100000),
  requiresManagerApproval: z.boolean(),
  requiresHrApproval: z.boolean(),
  allowAttachments: z.boolean(),
  isActive: z.boolean(),
});
export type RequestTypeFormValues = z.infer<typeof requestTypeFormSchema>;

export const saveRequestTypeSchema = z.object({ id: guid.nullable(), values: requestTypeFormSchema });

export const duplicateRequestTypeSchema = z.object({
  sourceId: guid,
  key: z.string().trim().regex(KEY_RE, 'requestConfig.validation.key'),
  nameAr: requiredText(120),
  nameEn: requiredText(120),
});
export type DuplicateRequestTypeValues = z.infer<typeof duplicateRequestTypeSchema>;

export const setTypeActiveSchema = z.object({ id: guid, active: z.boolean() });
export const typeIdSchema = z.object({ id: guid });

const optionSchema = z.object({
  value: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/, 'requestConfig.validation.optionValue'),
  label_ar: requiredText(200),
  label_en: requiredText(200),
});

const ruleSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ field: z.string().min(1).max(64), in: z.array(z.unknown()).max(100) }),
    z.object({ field: z.string().min(1).max(64), not_in: z.array(z.unknown()).max(100) }),
    z.object({ all: z.array(ruleSchema).max(20) }),
    z.object({ any: z.array(ruleSchema).max(20) }),
  ]),
);

export const builderFieldSchema = z.object({
  id: guid.nullable(),
  key: z.string().trim().regex(KEY_RE, 'requestConfig.validation.key'),
  field_type: z.enum(REQUEST_FIELD_TYPES),
  label_ar: requiredText(200),
  label_en: requiredText(200),
  help_ar: text(500).nullable(),
  help_en: text(500).nullable(),
  placeholder_ar: text(200).nullable(),
  placeholder_en: text(200).nullable(),
  required: z.boolean(),
  is_active: z.boolean(),
  options: z.array(optionSchema).max(100),
  visibility: ruleSchema.nullable(),
  validation: z.record(z.string(), z.unknown()),
});
export type BuilderFieldPayload = z.infer<typeof builderFieldSchema>;

export const saveFieldsSchema = z.object({
  typeId: guid,
  fields: z.array(builderFieldSchema).max(80),
});

export const workflowStepSchema = z
  .object({
    id: guid.nullable(),
    step_type: z.enum(STEP_TYPES),
    name_ar: requiredText(120),
    name_en: requiredText(120),
    approver_role_key: z.string().trim().max(64).nullable(),
    approver_user_id: guid.nullable(),
    sla_business_days: z.number().int().min(0).max(365).nullable(),
    can_return: z.boolean(),
    can_reassign: z.boolean(),
  })
  .refine((s) => s.step_type !== 'role' || Boolean(s.approver_role_key), { path: ['approver_role_key'], message: 'requestConfig.validation.roleRequired' })
  .refine((s) => s.step_type !== 'user' || Boolean(s.approver_user_id), { path: ['approver_user_id'], message: 'requestConfig.validation.userRequired' });
export type WorkflowStepPayload = z.infer<typeof workflowStepSchema>;

export const saveWorkflowSchema = z.object({
  typeId: guid,
  steps: z.array(workflowStepSchema).min(1, 'errors.approvalStepRequired').max(10),
});

export const searchUsersSchema = z.object({ query: z.string().trim().max(100) });

export const saveSlaSchema = z.object({
  id: guid,
  days: z.number().int('validation.invalidValue').min(0, 'validation.min|{"min":0}').max(365, 'validation.max|{"max":365}').nullable(),
});
