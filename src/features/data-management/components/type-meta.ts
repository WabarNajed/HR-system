import {
  BriefcaseIcon,
  Building2Icon,
  CalendarCheck2Icon,
  CalendarDaysIcon,
  FileTextIcon,
  HeartPulseIcon,
  LandmarkIcon,
  MapPinIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ImportType } from '../lib/types';

export const TYPE_ICONS: Record<ImportType, LucideIcon> = {
  employees: UsersIcon,
  departments: Building2Icon,
  job_titles: BriefcaseIcon,
  locations: MapPinIcon,
  cost_centers: LandmarkIcon,
  leave_balances: CalendarDaysIcon,
  dependents: UsersRoundIcon,
  insurance: HeartPulseIcon,
  documents: FileTextIcon,
  public_holidays: CalendarCheck2Icon,
};

export const TYPE_GROUPS: Array<{ key: 'people' | 'records' | 'masterData'; types: ImportType[] }> = [
  { key: 'people', types: ['employees'] },
  { key: 'records', types: ['leave_balances', 'dependents', 'insurance', 'documents'] },
  { key: 'masterData', types: ['departments', 'job_titles', 'locations', 'cost_centers', 'public_holidays'] },
];

/** Where imported records can be seen after an import. */
export const TYPE_DESTINATIONS: Record<ImportType, string> = {
  employees: '/employees',
  departments: '/settings/departments',
  job_titles: '/settings/job-titles',
  locations: '/settings/locations',
  cost_centers: '/settings/cost-centers',
  public_holidays: '/settings/public-holidays',
  leave_balances: '/leave',
  dependents: '/employees',
  insurance: '/employees',
  documents: '/documents',
};

export const templateHref = (type: ImportType, lang?: 'ar' | 'en') => `/api/data-management/templates/${type}${lang ? `?lang=${lang}` : ''}`;
export const errorReportHref = (importId: string) => `/api/data-management/imports/${importId}/error-report`;
export const importHref = (params: { type?: ImportType; id?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.id) qs.set('id', params.id);
  const s = qs.toString();
  return `/admin/data-management/import${s ? `?${s}` : ''}`;
};
