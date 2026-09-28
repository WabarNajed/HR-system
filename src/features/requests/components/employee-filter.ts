'use client';

import type { FilterOption, SelectFilterDef } from '@/components/data-table';
import type { Locale } from '@/lib/i18n/config';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { searchEmployeeFilterOptionsAction } from '../actions';

export type EmployeeFilterChoice = { id: string; name_ar: string | null; name_en: string | null; hint?: string | null };

const toOption = (e: EmployeeFilterChoice, locale: Locale): FilterOption => ({
  value: e.id,
  label: [employeeDisplayName(e, locale), e.hint].filter(Boolean).join(' · '),
});

/**
 * The "Employee" filter of the request / approvals tables. `searchable` (more employees than the
 * server lists): `employees` holds only the selected ones and the rest are found by server search.
 * Null when there is nothing to offer.
 */
export function employeeFilterDef<TData>(
  title: string,
  employees: EmployeeFilterChoice[] | null | undefined,
  searchable: boolean,
  locale: Locale,
): SelectFilterDef<TData> | null {
  if (!employees || (!employees.length && !searchable)) return null;
  return {
    key: 'employee',
    title,
    options: employees.map((e) => toOption(e, locale)),
    search: searchable
      ? async (q) => {
          const res = await searchEmployeeFilterOptionsAction({ q });
          if (!res.ok) throw new Error(res.error);
          return (res.data ?? []).map((e) => toOption(e, locale));
        }
      : undefined,
  };
}
