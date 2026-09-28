'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { getBalanceHistory as loadBalanceHistory, getLeaveAccess, getOrgPermissions } from './queries';
import {
  adjustBalanceSchema,
  balanceHistorySchema,
  holidaySchema,
  idSchema,
  initializeBalancesSchema,
  leaveTypeSchema,
  setBalanceSchema,
  toggleActiveSchema,
} from './schemas';
import type { BalanceHistory } from './types';

/**
 * Leave module mutations. Every action checks the permission on the server (defense in depth);
 * the database enforces the same rules through RLS and the security-definer RPCs.
 */

function revalidateLeaveConfig() {
  revalidatePath('/leave');
  revalidatePath('/settings/leave-types');
  revalidatePath('/settings/public-holidays');
}

function revalidateBalances() {
  revalidatePath('/leave');
  revalidatePath('/employees/[id]', 'page');
  revalidatePath('/dashboard');
}

/* ─── Leave types ────────────────────────────────────────────────────────── */

export const saveLeaveType = withAction(
  leaveTypeSchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const row = {
      name_ar: input.name_ar,
      name_en: input.name_en,
      description_ar: input.description_ar,
      description_en: input.description_en,
      is_paid: input.is_paid,
      deducts_balance: input.deducts_balance,
      default_entitlement: input.default_entitlement,
      max_days_per_request: input.max_days_per_request ?? null,
      day_count_basis: input.day_count_basis,
      requires_attachment: input.requires_attachment,
      gender_restriction: input.gender_restriction ?? null,
      color: input.color.toUpperCase(),
      sort_order: input.sort_order,
      is_active: input.is_active,
    };
    if (input.id) {
      // The code is immutable after creation (other modules and reports key on it).
      const { data, error } = await supabase.from('leave_types').update(row).eq('id', input.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new ActionError('errors.notFound');
    } else {
      const { error } = await supabase.from('leave_types').insert({ ...row, code: input.code });
      if (error) {
        if (error.code === '23505') throw new ActionError('errors.validation', { code: 'leave.types.form.codeTaken' });
        throw error;
      }
    }
    revalidateLeaveConfig();
    return ok(undefined, input.id ? 'leave.types.toast.updated' : 'leave.types.toast.created');
  },
  { scope: 'leave.saveLeaveType' },
);

export const setLeaveTypeActive = withAction(
  toggleActiveSchema,
  async ({ id, active }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const { data, error } = await supabase.from('leave_types').update({ is_active: active }).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ActionError('errors.notFound');
    revalidateLeaveConfig();
    return ok(undefined, active ? 'leave.types.toast.activated' : 'leave.types.toast.deactivated');
  },
  { scope: 'leave.setLeaveTypeActive' },
);

export const deleteLeaveType = withAction(
  idSchema,
  async ({ id }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const { data, error } = await supabase.from('leave_types').delete().eq('id', id).select('id');
    if (error) {
      if (error.code === '23503') throw new ActionError('leave.types.toast.inUse');
      throw error;
    }
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateLeaveConfig();
    return ok(undefined, 'leave.types.toast.deleted');
  },
  { scope: 'leave.deleteLeaveType' },
);

/* ─── Public holidays ────────────────────────────────────────────────────── */

export const savePublicHoliday = withAction(
  holidaySchema,
  async (input, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const row = {
      name_ar: input.name_ar,
      name_en: input.name_en,
      start_date: input.start_date,
      end_date: input.end_date,
      is_active: input.is_active,
    };
    if (input.id) {
      const { data, error } = await supabase.from('public_holidays').update(row).eq('id', input.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new ActionError('errors.notFound');
    } else {
      const { error } = await supabase.from('public_holidays').insert(row);
      if (error) throw error;
    }
    revalidateLeaveConfig();
    return ok(undefined, input.id ? 'leave.holidays.toast.updated' : 'leave.holidays.toast.created');
  },
  { scope: 'leave.savePublicHoliday' },
);

export const setPublicHolidayActive = withAction(
  toggleActiveSchema,
  async ({ id, active }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const { data, error } = await supabase.from('public_holidays').update({ is_active: active }).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new ActionError('errors.notFound');
    revalidateLeaveConfig();
    return ok(undefined, active ? 'leave.holidays.toast.activated' : 'leave.holidays.toast.deactivated');
  },
  { scope: 'leave.setPublicHolidayActive' },
);

export const deletePublicHoliday = withAction(
  idSchema,
  async ({ id }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit', 'leave.administer');
    const supabase = await createClient();
    const { data, error } = await supabase.from('public_holidays').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidateLeaveConfig();
    return ok(undefined, 'leave.holidays.toast.deleted');
  },
  { scope: 'leave.deletePublicHoliday' },
);

/* ─── Balances ───────────────────────────────────────────────────────────── */

/**
 * Organization `leave.edit`, and — segregation of duties, mirrored by the RPCs — never on the actor's
 * own balance (super_admin excepted, as for approvals). `employeeId` null = every employee (bulk init).
 */
async function requireOrgLeaveEdit(ctx: Parameters<typeof getOrgPermissions>[0], employeeId: string | null) {
  requirePermissionIn(ctx, 'leave.edit');
  const org = await getOrgPermissions(ctx);
  if (!org.has('leave.edit')) throw new ActionError('errors.forbidden');
  const access = await getLeaveAccess(ctx);
  if (employeeId && employeeId === access.employeeId && !access.canEditOwnBalances) {
    throw new ActionError('errors.selfChangeNotAllowed');
  }
}

export const adjustLeaveBalance = withAction(
  adjustBalanceSchema,
  async (input, { ctx }) => {
    await requireOrgLeaveEdit(ctx, input.employeeId);
    const supabase = await createClient();
    const { error } = await supabase.rpc('adjust_leave_balance', {
      p_employee_id: input.employeeId,
      p_leave_type_id: input.leaveTypeId,
      p_year: input.year,
      p_amount: input.amount,
      p_reason: input.reason,
    });
    if (error) throw error;
    revalidateBalances();
    return ok(undefined, 'leave.adjust.toast');
  },
  { scope: 'leave.adjustLeaveBalance' },
);

export const setLeaveBalance = withAction(
  setBalanceSchema,
  async (input, { ctx }) => {
    await requireOrgLeaveEdit(ctx, input.employeeId);
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_leave_balance', {
      p_employee_id: input.employeeId,
      p_leave_type_id: input.leaveTypeId,
      p_year: input.year,
      p_opening_balance: input.openingBalance,
      p_entitlement: input.entitlement,
    });
    if (error) throw error;
    revalidateBalances();
    return ok(undefined, 'leave.editBalance.toast');
  },
  { scope: 'leave.setLeaveBalance' },
);

export const initializeLeaveBalances = withAction(
  initializeBalancesSchema,
  async (input, { ctx }) => {
    await requireOrgLeaveEdit(ctx, input.employeeId ?? null);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'initialize_leave_balances',
      input.employeeId ? { p_year: input.year, p_employee_id: input.employeeId } : { p_year: input.year },
    );
    if (error) throw error;
    revalidateBalances();
    const created = typeof data === 'number' ? data : 0;
    return ok({ created }, created > 0 ? 'leave.initialize.toastCreated' : 'leave.initialize.toastNone');
  },
  { scope: 'leave.initializeLeaveBalances' },
);

/** Read-only: adjustments + leave requests of one balance (RLS decides visibility). */
export const fetchBalanceHistory = withAction(
  balanceHistorySchema,
  async ({ balanceId }, { ctx }) => {
    const history = await loadBalanceHistory(balanceId, await getLeaveAccess(ctx));
    if (!history) throw new ActionError('errors.notFound');
    return ok<BalanceHistory>(history);
  },
  { scope: 'leave.fetchBalanceHistory' },
);
