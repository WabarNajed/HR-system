import 'server-only';

import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { ReportFilterKey } from './definitions';

/** Option shown by a filter control (label already localized). */
export type FilterOption = { value: string; label: string; description?: string; inactive?: boolean };

export type FilterOptions = Partial<Record<ReportFilterKey, FilterOption[]>>;

type NamedRow = { id: string; name_ar: string | null; name_en: string | null; is_active?: boolean | null };

function named(rows: NamedRow[] | null | undefined, locale: Locale): FilterOption[] {
  return (rows ?? [])
    .map((r) => ({ value: r.id, label: localized(r, 'name', locale) || '—', inactive: r.is_active === false }))
    .sort((a, b) => Number(a.inactive) - Number(b.inactive) || a.label.localeCompare(b.label, locale));
}

/**
 * Loads the option lists the report's filter bar needs, through the user's RLS client (a manager's
 * lists only contain what they can see).
 */
export async function loadFilterOptions(
  supabase: ServerSupabaseClient,
  keys: readonly ReportFilterKey[],
  locale: Locale,
): Promise<FilterOptions> {
  const want = new Set(keys);
  const out: FilterOptions = {};
  const tasks: Promise<void>[] = [];

  if (want.has('department')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('departments').select('id, name_ar, name_en, is_active').order('name_en').limit(1000);
        out.department = named(data, locale);
      })(),
    );
  }
  if (want.has('location')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('locations').select('id, name_ar, name_en, is_active').order('name_en').limit(1000);
        out.location = named(data, locale);
      })(),
    );
  }
  if (want.has('jobTitle')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('job_titles').select('id, name_ar, name_en, is_active').order('name_en').limit(1000);
        out.jobTitle = named(data, locale);
      })(),
    );
  }
  if (want.has('requestType')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('request_types').select('id, name_ar, name_en, is_active').order('sort_order').limit(500);
        out.requestType = named(data, locale);
      })(),
    );
  }
  if (want.has('leaveType')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('leave_types').select('id, name_ar, name_en, is_active, sort_order').order('sort_order').limit(200);
        out.leaveType = (data ?? []).map((r) => ({ value: r.id, label: localized(r, 'name', locale) || '—', inactive: r.is_active === false }));
      })(),
    );
  }
  if (want.has('nationality')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.rpc('report_employee_breakdown', { p_dimension: 'nationality', p_filters: {} as never });
        out.nationality = (data ?? [])
          .filter((r) => r.group_key)
          .sort((a, b) => (b.headcount ?? 0) - (a.headcount ?? 0))
          .map((r) => ({ value: r.group_key, label: r.group_key }));
      })(),
    );
  }
  if (want.has('manager')) {
    tasks.push(
      (async () => {
        const { data } = await supabase
          .rpc('report_employee_rows', { p_filters: { scope: 'records' } as never })
          .select('manager_id, manager_name_ar, manager_name_en')
          .not('manager_id', 'is', null)
          .limit(10000);
        const seen = new Map<string, FilterOption>();
        for (const r of (data ?? []) as Array<{ manager_id: string | null; manager_name_ar: string | null; manager_name_en: string | null }>) {
          if (!r.manager_id || seen.has(r.manager_id)) continue;
          const label = employeeDisplayName({ name_ar: r.manager_name_ar, name_en: r.manager_name_en }, locale);
          if (label) seen.set(r.manager_id, { value: r.manager_id, label });
        }
        out.manager = Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label, locale));
      })(),
    );
  }
  if (want.has('year')) {
    tasks.push(
      (async () => {
        const { data } = await supabase.from('leave_balances').select('year').order('year', { ascending: false }).limit(5000);
        const years = new Set<number>((data ?? []).map((r) => r.year));
        years.add(new Date().getFullYear());
        out.year = Array.from(years)
          .sort((a, b) => b - a)
          .map((y) => ({ value: String(y), label: String(y) }));
      })(),
    );
  }

  await Promise.all(tasks);
  return out;
}

export type EmployeeOption = { value: string; label: string; description?: string };

/** Labels for already-selected employee ids (employee filter chips). */
export async function loadEmployeeOptions(supabase: ServerSupabaseClient, ids: readonly string[], locale: Locale): Promise<EmployeeOption[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('employees').select('id, name_ar, name_en, employee_number').in('id', ids.slice(0, 20));
  return (data ?? []).map((e) => ({
    value: e.id,
    label: employeeDisplayName(e, locale),
    description: e.employee_number ?? undefined,
  }));
}
