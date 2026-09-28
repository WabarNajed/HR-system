import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.invalidDate')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    const y = Number(v.slice(0, 4));
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && y >= 2000 && y <= 2200;
  }, 'validation.invalidDate');
const year = z.coerce.number().int().min(2000).max(2200);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const leaveTypeSchema = z.object({
  id: uuid.optional().nullable(),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'validation.required')
    .max(63)
    .regex(/^[a-z][a-z0-9_]*$/, 'leave.types.form.codePattern'),
  name_ar: z.string().trim().min(1, 'validation.required').max(120),
  name_en: z.string().trim().min(1, 'validation.required').max(120),
  description_ar: optionalText(500),
  description_en: optionalText(500),
  is_paid: z.boolean(),
  deducts_balance: z.boolean(),
  default_entitlement: z.coerce.number().min(0).max(365),
  max_days_per_request: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? null : v),
    z.coerce.number().positive().max(365).nullable(),
  ),
  day_count_basis: z.enum(['working', 'calendar']),
  requires_attachment: z.boolean(),
  gender_restriction: z.enum(['male', 'female']).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'common.colorPicker.invalid'),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean(),
});
export type LeaveTypeInput = z.input<typeof leaveTypeSchema>;

export const idSchema = z.object({ id: uuid });
export const toggleActiveSchema = z.object({ id: uuid, active: z.boolean() });

export const holidaySchema = z
  .object({
    id: uuid.optional().nullable(),
    name_ar: optionalText(120),
    name_en: optionalText(120),
    start_date: isoDate,
    end_date: isoDate,
    is_active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.name_ar && !v.name_en) ctx.addIssue({ code: 'custom', path: ['name_ar'], message: 'leave.holidays.form.nameRequired' });
    if (v.end_date < v.start_date) ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'leave.holidays.form.endBeforeStart' });
  });
export type HolidayInput = z.input<typeof holidaySchema>;

export const adjustBalanceSchema = z.object({
  employeeId: uuid,
  leaveTypeId: uuid,
  year,
  amount: z.coerce
    .number()
    .min(-365)
    .max(365)
    .refine((n) => n !== 0, 'leave.adjust.amountNonZero')
    .refine((n) => Math.round(n * 2) === n * 2, 'leave.adjust.amountStep'),
  reason: z.string().trim().min(3, 'leave.adjust.reasonRequired').max(500),
});
export type AdjustBalanceInput = z.input<typeof adjustBalanceSchema>;

export const setBalanceSchema = z.object({
  employeeId: uuid,
  leaveTypeId: uuid,
  year,
  openingBalance: z.coerce.number().min(-365).max(365),
  entitlement: z.coerce.number().min(0).max(365),
});
export type SetBalanceInput = z.input<typeof setBalanceSchema>;

export const initializeBalancesSchema = z.object({ year, employeeId: uuid.optional().nullable() });

export const balanceHistorySchema = z.object({ balanceId: uuid });
