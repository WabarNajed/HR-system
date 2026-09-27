import { z } from 'zod';
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from './constants';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidDate')
  .nullable()
  .optional()
  .transform((v) => v || null);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `validation.maxLength|${JSON.stringify({ max })}`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

/** Metadata shared by uploads and edits. `expiryDate ≥ issueDate`. */
export const documentMetadataSchema = z
  .object({
    documentType: z.enum(DOCUMENT_TYPES, { message: 'validation.required' }),
    documentNumber: optionalText(100),
    issueDate: isoDate,
    expiryDate: isoDate,
    isConfidential: z.boolean().default(false),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.issueDate && value.expiryDate && value.expiryDate < value.issueDate) {
      ctx.addIssue({ code: 'custom', path: ['expiryDate'], message: 'documents.validation.expiryBeforeIssue' });
    }
  });

export type DocumentMetadataInput = z.input<typeof documentMetadataSchema>;

const fileMetaSchema = z.object({
  fileName: z.string().trim().min(1, 'validation.required').max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().trim().max(120).default(''),
});

export const createUploadSchema = z.intersection(
  documentMetadataSchema,
  fileMetaSchema.extend({ employeeId: z.uuid('validation.required').nullable().optional() }),
);

export const documentIdSchema = z.object({ documentId: z.uuid() });

export const updateDocumentSchema = z.intersection(
  documentMetadataSchema,
  z.object({
    documentId: z.uuid(),
    /** Only valid/expired can be set by hand; review states use the review action. */
    status: z.enum(['valid', 'expired'] as const).optional(),
  }),
);

export const reviewDocumentSchema = z
  .object({
    documentId: z.uuid(),
    decision: z.enum(['approve', 'reject']),
    note: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'reject' && !value.note) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'documents.validation.reasonRequired' });
    }
  });

export const prepareReplaceSchema = fileMetaSchema.extend({ documentId: z.uuid() });

export const commitReplaceSchema = fileMetaSchema.extend({
  documentId: z.uuid(),
  path: z.string().min(1).max(500),
});

export const uploadContextSchema = z.object({ employeeId: z.uuid().nullable().optional() });

export const employeeSearchSchema = z.object({ query: z.string().trim().max(100).default('') });

export const statusSchema = z.enum(DOCUMENT_STATUSES);
