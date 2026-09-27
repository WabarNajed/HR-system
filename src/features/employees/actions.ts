'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ActionError, fail, ok, withAction, requireActionSession } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import { formatIban } from '@/lib/format';
import { createClient } from '@/lib/supabase/server';
import { BUCKETS, removeFiles, fileRouteUrl } from '@/lib/storage';
import { mapError } from '@/lib/errors';
import type { Json } from '@/types/database';
import { getViewer } from './queries';
import {
  BANK_FIELDS,
  COMPENSATION_FIELDS,
  PERSONAL_FIELDS,
  deleteChildSchema,
  employeeIdSchema,
  normalizeIban,
  saveDependentSchema,
  saveEmployeeSchema,
  saveInsuranceSchema,
  toNullable,
  type EmployeeFormValues,
} from './schemas';

const PERSONAL = new Set<string>(PERSONAL_FIELDS);
const NON_EMPLOYEE_KEYS = new Set<string>([...COMPENSATION_FIELDS, ...BANK_FIELDS]);

function revalidateEmployee(id?: string | null) {
  revalidatePath('/employees');
  if (id) revalidatePath(`/employees/${id}`);
}

/** Maps unique-constraint violations to the offending field. */
function saveErrorToFieldErrors(error: unknown): { key: string; fieldErrors?: Record<string, string> } {
  const e = error as { code?: string; message?: string; details?: string };
  const text = `${e?.message ?? ''} ${e?.details ?? ''}`;
  if (e?.code === '23505') {
    if (text.includes('employees_employee_number_key')) {
      return { key: 'errors.duplicate', fieldErrors: { employee_number: 'employees.validation.employeeNumberTaken' } };
    }
    if (text.includes('employees_national_id_key')) {
      return { key: 'errors.duplicate', fieldErrors: { national_id: 'employees.validation.nationalIdTaken' } };
    }
  }
  const key = mapError(error);
  if (key === 'errors.managerCycle') return { key, fieldErrors: { manager_id: 'errors.managerCycle' } };
  return { key };
}

/** Archived records are read-only until restored (UI hides the controls; this is the server rule). */
async function assertEditable(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string) {
  const { data, error } = await supabase.from('employees').select('archived_at').eq('id', employeeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError('errors.notFound');
  if (data.archived_at) throw new ActionError('employees.actions.editDisabledArchived');
}

/* ─── Create / update ─────────────────────────────────────────────────────── */

export const saveEmployee = withAction(
  saveEmployeeSchema,
  async ({ id, values }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan(id ? 'employees.edit' : 'employees.create')) throw new ActionError('errors.forbidden');
    const canPersonal = viewer.orgCan('personal_data.edit');
    const canBank = viewer.orgCan('bank.edit');

    const employee: Record<string, Json> = {};
    for (const [key, raw] of Object.entries(values) as [keyof EmployeeFormValues, string][]) {
      if (NON_EMPLOYEE_KEYS.has(key)) continue;
      if (PERSONAL.has(key) && !canPersonal) continue;
      if (key === 'is_outside_kingdom') {
        employee[key] = raw === 'outside' ? true : raw === 'inside' ? false : null;
      } else {
        employee[key] = toNullable(raw);
      }
    }
    if (id && employee.manager_id === id) {
      return fail('errors.validation', { manager_id: 'errors.managerCycle' });
    }

    let compensation: Record<string, Json> | null = null;
    let bank: Record<string, Json> | null = null;
    if (canBank) {
      const amounts = [values.basic_salary, values.housing_allowance, values.transport_allowance, values.other_allowance];
      if (amounts.some(Boolean) || values.compensation_effective_date) {
        compensation = {
          basic_salary: Number(values.basic_salary || 0),
          housing_allowance: Number(values.housing_allowance || 0),
          transport_allowance: Number(values.transport_allowance || 0),
          other_allowance: Number(values.other_allowance || 0),
          effective_date: toNullable(values.compensation_effective_date),
        };
      }
      const hasBank = Boolean(values.bank_name || values.iban || values.account_holder);
      if (hasBank || id) {
        bank = {
          bank_name: toNullable(values.bank_name),
          iban: values.iban ? normalizeIban(values.iban) : null,
          account_holder: toNullable(values.account_holder),
        };
      }
    }

    const supabase = await createClient();
    if (id) await assertEditable(supabase, id);
    const { data, error } = await supabase.rpc('save_employee', {
      // null = create (the generated type has no nullable uuid args)
      p_employee_id: (id ?? null) as unknown as string,
      p_employee: employee,
      p_compensation: compensation ?? undefined,
      p_bank: bank ?? undefined,
    });
    if (error) {
      const mapped = saveErrorToFieldErrors(error);
      if (mapped.key === 'errors.generic') console.error('[employees] save failed:', error.code, error.message);
      return fail(mapped.key, mapped.fieldErrors);
    }
    const savedId = (data as string | null) ?? id;
    revalidateEmployee(savedId);
    return ok({ id: savedId as string }, id ? 'employees.toast.saved' : 'employees.toast.created');
  },
  { scope: 'employees.save' },
);

/* ─── Archive / restore ───────────────────────────────────────────────────── */

async function setArchived(id: string, archived: boolean) {
  const ctx = await requireActionSession();
  const viewer = await getViewer(ctx);
  if (!viewer.orgCan('employees.edit')) throw new ActionError('errors.forbidden');
  const supabase = await createClient();
  // Only rows in the opposite state change, so a repeated click (stale page, double submit) neither
  // moves the archive date nor writes a second audit entry.
  let query = supabase.from('employees').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id);
  query = archived ? query.is('archived_at', null) : query.not('archived_at', 'is', null);
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (!data?.length) {
    const { data: row, error: readError } = await supabase.from('employees').select('id').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!row) throw new ActionError('errors.notFound');
  }
  revalidateEmployee(id);
}

export const archiveEmployee = withAction(
  employeeIdSchema,
  async ({ id }) => {
    await setArchived(id, true);
    return ok(undefined, 'employees.toast.archived');
  },
  { scope: 'employees.archive' },
);

export const restoreEmployee = withAction(
  employeeIdSchema,
  async ({ id }) => {
    await setArchived(id, false);
    return ok(undefined, 'employees.toast.restored');
  },
  { scope: 'employees.restore' },
);

/* ─── Avatar ──────────────────────────────────────────────────────────────── */

/**
 * Sets the avatar after the browser uploaded the file to `employee-documents/{id}/avatar/…` (storage
 * policy: org `employees.edit`). Uploading from the browser avoids the Server Action body limit.
 * The previous photo is removed.
 */
export const setEmployeeAvatar = withAction(
  z.object({ id: z.string().uuid(), path: z.string().max(200) }),
  async ({ id, path }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan('employees.edit')) throw new ActionError('errors.forbidden');
    if (!new RegExp(`^${id}/avatar/[A-Za-z0-9-]+\\.(jpe?g|png|webp)$`).test(path)) throw new ActionError('errors.validation');
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from('employees').select('avatar_path, archived_at').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new ActionError('errors.notFound');
    if (current.archived_at) throw new ActionError('employees.actions.editDisabledArchived');
    const { error } = await supabase.from('employees').update({ avatar_path: path }).eq('id', id);
    if (error) throw error;
    if (current.avatar_path && current.avatar_path !== path) {
      await removeFiles(supabase, BUCKETS.employeeDocuments, [current.avatar_path]);
    }
    revalidateEmployee(id);
    return ok({ url: fileRouteUrl(BUCKETS.employeeDocuments, path) }, 'employees.toast.avatarUpdated');
  },
  { scope: 'employees.avatar.set' },
);

export const removeEmployeeAvatar = withAction(
  employeeIdSchema,
  async ({ id }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan('employees.edit')) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from('employees').select('avatar_path').eq('id', id).maybeSingle();
    if (readError) throw readError;
    if (!current) throw new ActionError('errors.notFound');
    const { error } = await supabase.from('employees').update({ avatar_path: null }).eq('id', id);
    if (error) throw error;
    if (current.avatar_path) await removeFiles(supabase, BUCKETS.employeeDocuments, [current.avatar_path]);
    revalidateEmployee(id);
    return ok(undefined, 'employees.toast.avatarRemoved');
  },
  { scope: 'employees.avatar.remove' },
);

/* ─── IBAN reveal (audited) ───────────────────────────────────────────────── */

export const revealEmployeeIban = withAction(
  employeeIdSchema,
  async ({ id }, { ctx }) => {
    const viewer = await getViewer(ctx);
    const isSelf = viewer.employeeId === id;
    if (!isSelf && !viewer.orgCan('bank.view')) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('employee_bank_accounts')
      .select('id, iban')
      .eq('employee_id', id)
      .order('is_primary', { ascending: false })
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data?.iban) throw new ActionError('errors.notFound');
    if (!isSelf) {
      await logAuditEvent(
        { action: 'employee.iban_reveal', entityType: 'employee', entityId: id, summary: 'IBAN revealed' },
        supabase,
      );
    }
    return ok({ iban: formatIban(data.iban) });
  },
  { scope: 'employees.iban.reveal' },
);

/* ─── Manager picker ──────────────────────────────────────────────────────── */

export const searchManagerCandidates = withAction(
  z.object({ employeeId: z.string().uuid().nullable(), query: z.string().max(100) }),
  async ({ employeeId, query }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan('employees.edit') && !viewer.orgCan('employees.create')) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('employee_manager_candidates', {
      p_employee_id: employeeId ?? undefined,
      p_query: query || undefined,
      p_limit: 25,
    });
    if (error) throw error;
    return ok(
      (data ?? []).map((r) => ({
        id: r.id,
        employee_number: r.employee_number,
        name_ar: r.name_ar,
        name_en: r.name_en,
        job_title_ar: r.job_title_ar,
        job_title_en: r.job_title_en,
      })),
    );
  },
  { scope: 'employees.managers.search' },
);

/* ─── Dependents ──────────────────────────────────────────────────────────── */

export const saveDependent = withAction(
  saveDependentSchema,
  async ({ employeeId, id, values }, { ctx }) => {
    const viewer = await getViewer(ctx);
    const allowed = id ? viewer.orgCan('personal_data.edit') : viewer.orgCan('personal_data.create') || viewer.orgCan('personal_data.edit');
    if (!allowed) throw new ActionError('errors.forbidden');
    const row = {
      name_ar: toNullable(values.name_ar),
      name_en: toNullable(values.name_en),
      relationship: values.relationship,
      date_of_birth: toNullable(values.date_of_birth),
      nationality: toNullable(values.nationality),
      national_id: toNullable(values.national_id),
      iqama_expiry_date: toNullable(values.iqama_expiry_date),
      passport_number: toNullable(values.passport_number),
      passport_expiry_date: toNullable(values.passport_expiry_date),
      insurance_status: toNullable(values.insurance_status),
      insurance_member_number: toNullable(values.insurance_member_number),
      notes: toNullable(values.notes),
    };
    const supabase = await createClient();
    await assertEditable(supabase, employeeId);
    if (id) {
      const { data, error } = await supabase.from('employee_dependents').update(row).eq('id', id).eq('employee_id', employeeId).select('id');
      if (error) throw error;
      if (!data?.length) throw new ActionError('errors.notFound');
    } else {
      const { error } = await supabase.from('employee_dependents').insert({ ...row, employee_id: employeeId });
      if (error) throw error;
    }
    revalidatePath(`/employees/${employeeId}`);
    return ok(undefined, id ? 'employees.toast.dependentUpdated' : 'employees.toast.dependentAdded');
  },
  { scope: 'employees.dependents.save' },
);

export const deleteDependent = withAction(
  deleteChildSchema,
  async ({ employeeId, id }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan('personal_data.edit')) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    await assertEditable(supabase, employeeId);
    const { data, error } = await supabase.from('employee_dependents').delete().eq('id', id).eq('employee_id', employeeId).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidatePath(`/employees/${employeeId}`);
    return ok(undefined, 'employees.toast.dependentDeleted');
  },
  { scope: 'employees.dependents.delete' },
);

/* ─── Insurance ───────────────────────────────────────────────────────────── */

export const saveInsurance = withAction(
  saveInsuranceSchema,
  async ({ employeeId, id, values }, { ctx }) => {
    const viewer = await getViewer(ctx);
    const allowed = id ? viewer.orgCan('insurance.edit') : viewer.orgCan('insurance.create') || viewer.orgCan('insurance.edit');
    if (!allowed) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    await assertEditable(supabase, employeeId);
    if (values.dependent_id) {
      const { data: dep, error: depError } = await supabase
        .from('employee_dependents')
        .select('id')
        .eq('id', values.dependent_id)
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (depError) throw depError;
      if (!dep) return fail('errors.validation', { dependent_id: 'validation.invalidValue' });
    }
    const row = {
      dependent_id: toNullable(values.dependent_id),
      provider: toNullable(values.provider),
      policy_number: toNullable(values.policy_number),
      class: toNullable(values.class),
      member_number: toNullable(values.member_number),
      start_date: toNullable(values.start_date),
      expiry_date: toNullable(values.expiry_date),
      status: values.status,
    };
    if (id) {
      const { data, error } = await supabase.from('employee_insurance').update(row).eq('id', id).eq('employee_id', employeeId).select('id');
      if (error) throw error;
      if (!data?.length) throw new ActionError('errors.notFound');
    } else {
      const { error } = await supabase.from('employee_insurance').insert({ ...row, employee_id: employeeId });
      if (error) throw error;
    }
    revalidatePath(`/employees/${employeeId}`);
    return ok(undefined, id ? 'employees.toast.insuranceUpdated' : 'employees.toast.insuranceAdded');
  },
  { scope: 'employees.insurance.save' },
);

export const deleteInsurance = withAction(
  deleteChildSchema,
  async ({ employeeId, id }, { ctx }) => {
    const viewer = await getViewer(ctx);
    if (!viewer.orgCan('insurance.edit')) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    await assertEditable(supabase, employeeId);
    const { data, error } = await supabase.from('employee_insurance').delete().eq('id', id).eq('employee_id', employeeId).select('id');
    if (error) throw error;
    if (!data?.length) throw new ActionError('errors.notFound');
    revalidatePath(`/employees/${employeeId}`);
    return ok(undefined, 'employees.toast.insuranceDeleted');
  },
  { scope: 'employees.insurance.delete' },
);
