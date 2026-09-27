import { BriefcaseIcon, LandmarkIcon, MapPinIcon, WalletIcon, type LucideIcon } from 'lucide-react';

/**
 * Master data entities managed from the Settings console (HR setup group). One shared page
 * pattern drives all four: header (Add · Import), KPI row, DataTable (search, status filter,
 * sorting, column visibility, export), create/edit sheet, activate/deactivate, delete-when-unused.
 * Isomorphic (no server-only imports).
 */
export const MASTER_ENTITIES = ['departments', 'job_titles', 'locations', 'cost_centers'] as const;
export type MasterEntity = (typeof MASTER_ENTITIES)[number];

export type MasterEntityConfig = {
  entity: MasterEntity;
  /** i18n sub-namespace under `masterData.entities.<key>`. */
  key: 'departments' | 'jobTitles' | 'locations' | 'costCenters';
  route: '/settings/departments' | '/settings/job-titles' | '/settings/locations' | '/settings/cost-centers';
  /** `/api/export/<exportKey>` dataset. */
  exportKey: 'departments' | 'job-titles' | 'locations' | 'cost-centers';
  /** `/admin/data-management?type=<importType>` (Data Management import wizard). */
  importType: 'departments' | 'job_titles' | 'locations' | 'cost_centers';
  icon: LucideIcon;
  /** Extra form/table fields beyond code · names · description · status. */
  hasHierarchy: boolean;
  hasPlace: boolean;
};

export const MASTER_ENTITY_CONFIG: Record<MasterEntity, MasterEntityConfig> = {
  departments: {
    entity: 'departments',
    key: 'departments',
    route: '/settings/departments',
    exportKey: 'departments',
    importType: 'departments',
    icon: LandmarkIcon,
    hasHierarchy: true,
    hasPlace: false,
  },
  job_titles: {
    entity: 'job_titles',
    key: 'jobTitles',
    route: '/settings/job-titles',
    exportKey: 'job-titles',
    importType: 'job_titles',
    icon: BriefcaseIcon,
    hasHierarchy: false,
    hasPlace: false,
  },
  locations: {
    entity: 'locations',
    key: 'locations',
    route: '/settings/locations',
    exportKey: 'locations',
    importType: 'locations',
    icon: MapPinIcon,
    hasHierarchy: false,
    hasPlace: true,
  },
  cost_centers: {
    entity: 'cost_centers',
    key: 'costCenters',
    route: '/settings/cost-centers',
    exportKey: 'cost-centers',
    importType: 'cost_centers',
    icon: WalletIcon,
    hasHierarchy: false,
    hasPlace: false,
  },
};

export function isMasterEntity(value: unknown): value is MasterEntity {
  return typeof value === 'string' && (MASTER_ENTITIES as readonly string[]).includes(value);
}

/** Row shape shared by the page, the table and the edit sheet. */
export type MasterDataRow = {
  id: string;
  code: string | null;
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Locations only. */
  city: string | null;
  country: string | null;
  /** Departments only. */
  parent_id: string | null;
  parent: { id: string; name_ar: string | null; name_en: string | null } | null;
  head_employee_id: string | null;
  head: { id: string; name_ar: string | null; name_en: string | null; employee_number: string | null } | null;
  /** Non-archived employees assigned (from `master_data_usage`). */
  employees: number;
  /** All employees incl. archived — any reference blocks deletion. */
  allEmployees: number;
  /** Departments only: direct sub-departments. */
  children: number;
};

export type MasterDataKpis = {
  total: number;
  active: number;
  inactive: number;
  assigned: number;
  /** Non-archived employees without this attribute; null when the viewer can't see all employees. */
  unassigned: number | null;
  unused: number;
  /** Departments only. */
  withoutHead: number;
};
