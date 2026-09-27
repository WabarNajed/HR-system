import 'server-only';

import { fetchAllPages } from '@/lib/export/types';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { MasterDataKpis, MasterDataRow, MasterEntity } from './config';

/** Master data is small reference data; the list page loads it whole (client-side table). */
export const MASTER_DATA_LIMIT = 5000;

type Usage = { employees: number; allEmployees: number; children: number };

type RawRow = {
  id: string;
  code: string | null;
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  city?: string | null;
  country?: string | null;
  parent_id?: string | null;
  head_employee_id?: string | null;
  parent?: { id: string; name_ar: string | null; name_en: string | null } | null;
  head?: { id: string; name_ar: string | null; name_en: string | null; employee_number: string | null } | null;
};

const BASE = 'id, code, name_ar, name_en, description_ar, description_en, is_active, created_at, updated_at';

/** Loads every row of an entity (RLS as the user), ordered by code then name. */
export async function fetchMasterRows(supabase: ServerSupabaseClient, entity: MasterEntity, limit = MASTER_DATA_LIMIT): Promise<RawRow[]> {
  switch (entity) {
    case 'departments':
      return fetchAllPages<RawRow>(
        (from, to) =>
          supabase
            .from('departments')
            .select(
              `${BASE}, parent_id, head_employee_id, parent:parent_id(id, name_ar, name_en), head:head_employee_id(id, name_ar, name_en, employee_number)`,
            )
            .order('code', { ascending: true, nullsFirst: false })
            .order('name_ar', { ascending: true })
            .range(from, to) as unknown as PromiseLike<{ data: RawRow[] | null; error: unknown }>,
        limit,
      );
    case 'locations':
      return fetchAllPages<RawRow>(
        (from, to) =>
          supabase
            .from('locations')
            .select(`${BASE}, city, country`)
            .order('code', { ascending: true, nullsFirst: false })
            .order('name_ar', { ascending: true })
            .range(from, to),
        limit,
      );
    case 'job_titles':
      return fetchAllPages<RawRow>(
        (from, to) =>
          supabase
            .from('job_titles')
            .select(BASE)
            .order('code', { ascending: true, nullsFirst: false })
            .order('name_ar', { ascending: true })
            .range(from, to),
        limit,
      );
    case 'cost_centers':
      return fetchAllPages<RawRow>(
        (from, to) =>
          supabase
            .from('cost_centers')
            .select(BASE)
            .order('code', { ascending: true, nullsFirst: false })
            .order('name_ar', { ascending: true })
            .range(from, to),
        limit,
      );
  }
}

/** Employee / sub-department counts per row (security-definer RPC gated by settings.view). */
export async function fetchMasterUsage(supabase: ServerSupabaseClient, entity: MasterEntity): Promise<Map<string, Usage>> {
  const { data, error } = await supabase.rpc('master_data_usage', { p_entity: entity });
  if (error) throw error;
  const map = new Map<string, Usage>();
  for (const r of data ?? []) {
    map.set(r.id, { employees: Number(r.employees ?? 0), allEmployees: Number(r.all_employees ?? 0), children: Number(r.children ?? 0) });
  }
  return map;
}

export function toMasterRow(raw: RawRow, usage: Usage | undefined): MasterDataRow {
  return {
    id: raw.id,
    code: raw.code,
    name_ar: raw.name_ar,
    name_en: raw.name_en,
    description_ar: raw.description_ar,
    description_en: raw.description_en,
    is_active: raw.is_active,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    city: raw.city ?? null,
    country: raw.country ?? null,
    parent_id: raw.parent_id ?? null,
    parent: raw.parent ?? null,
    head_employee_id: raw.head_employee_id ?? null,
    head: raw.head ?? null,
    employees: usage?.employees ?? 0,
    allEmployees: usage?.allEmployees ?? 0,
    children: usage?.children ?? 0,
  };
}

/** Rows merged with usage counts. */
export async function listMasterData(supabase: ServerSupabaseClient, entity: MasterEntity): Promise<MasterDataRow[]> {
  const [rows, usage] = await Promise.all([fetchMasterRows(supabase, entity), fetchMasterUsage(supabase, entity)]);
  return rows.map((r) => toMasterRow(r, usage.get(r.id)));
}

const EMPLOYEE_COLUMN: Record<MasterEntity, 'department_id' | 'job_title_id' | 'location_id' | 'cost_center_id'> = {
  departments: 'department_id',
  job_titles: 'job_title_id',
  locations: 'location_id',
  cost_centers: 'cost_center_id',
};

/**
 * KPI row. `unassigned` counts non-archived employees missing this attribute — only meaningful
 * for viewers with organization-wide employee visibility (`includeUnassigned`), else null.
 */
export async function masterDataKpis(
  supabase: ServerSupabaseClient,
  entity: MasterEntity,
  rows: MasterDataRow[],
  includeUnassigned: boolean,
): Promise<MasterDataKpis> {
  let unassigned: number | null = null;
  if (includeUnassigned) {
    const { count, error } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .is(EMPLOYEE_COLUMN[entity], null)
      .is('archived_at', null);
    unassigned = error ? null : (count ?? 0);
  }
  const active = rows.filter((r) => r.is_active).length;
  return {
    total: rows.length,
    active,
    inactive: rows.length - active,
    assigned: rows.reduce((sum, r) => sum + r.employees, 0),
    unassigned,
    unused: rows.filter((r) => r.allEmployees === 0 && r.children === 0).length,
    withoutHead: entity === 'departments' ? rows.filter((r) => r.is_active && !r.head_employee_id).length : 0,
  };
}
