import { z } from 'zod';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const saveDraftSchema = z.object({
  requestId: uuid.optional().nullable(),
  typeId: uuid,
  /** Target employee (HR filing on behalf); omitted = the caller's own employee. */
  employeeId: uuid.optional().nullable(),
  values: z.record(z.string(), z.unknown()),
  subtype: z.string().max(100).optional().nullable(),
});

export const requestIdSchema = z.object({ requestId: uuid });

export const REQUEST_ACTIONS = ['approve', 'reject', 'return', 'reassign', 'start', 'complete', 'cancel'] as const;
export type RequestActionKind = (typeof REQUEST_ACTIONS)[number];

export const actOnRequestSchema = z
  .object({
    requestId: uuid,
    action: z.enum(REQUEST_ACTIONS),
    comment: z.string().trim().max(2000, 'validation.maxLength|{"max":2000}').optional().nullable(),
    targetUserId: uuid.optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.action === 'reject' || v.action === 'return') && !v.comment?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'validation.required' });
    }
    if (v.action === 'reassign' && !v.targetUserId) {
      ctx.addIssue({ code: 'custom', path: ['targetUserId'], message: 'validation.selectOne' });
    }
  });

export const addCommentSchema = z.object({
  requestId: uuid,
  body: z.string().trim().min(1, 'validation.required').max(5000, 'validation.maxLength|{"max":5000}'),
  internal: z.boolean().default(false),
});

export const registerAttachmentSchema = z.object({
  requestId: uuid,
  fieldKey: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/).optional().nullable(),
  path: z.string().min(10).max(512),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().nonnegative(),
  mime: z.string().max(200).optional().nullable(),
});

export const attachmentIdSchema = z.object({ attachmentId: uuid });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const previewLeaveSchema = z.object({
  employeeId: uuid,
  leaveTypeId: uuid,
  start: isoDate.optional().nullable(),
  end: isoDate.optional().nullable(),
  requestId: uuid.optional().nullable(),
});

export const lookupsSchema = z.object({ employeeId: uuid.optional().nullable() });

export const searchSchema = z.object({ q: z.string().trim().max(100).default('') });

export const searchAssigneesSchema = z.object({ requestId: uuid, q: z.string().trim().max(100).default('') });
