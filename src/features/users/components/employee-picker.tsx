'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useRef } from 'react';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { searchEmployeesAction } from '../actions';
import type { EmployeePickerOption } from '../types';

export type PickedEmployee = { id: string; label: string; description?: string };

type EmployeePickerProps = {
  value: string | null;
  onChange: (employee: (PickedEmployee & { option: EmployeePickerOption | null }) | null) => void;
  /** Label for the current value (e.g. the registration's suggested match) before any search. */
  selected?: PickedEmployee | null;
  /** Linked employees stay selectable only for this account (its own current link). */
  allowLinkedId?: string | null;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
};

/**
 * Async employee search (name, employee ID, company e-mail) for linking a portal account. Employees
 * already linked to another account are listed but disabled.
 */
export function EmployeePicker({ value, onChange, selected, allowLinkedId, disabled, id, ...aria }: EmployeePickerProps) {
  const t = useTranslations('users.picker');
  const locale = useLocale() as 'ar' | 'en';

  const cache = useRef(new Map<string, EmployeePickerOption>());

  const toOption = useCallback(
    (e: EmployeePickerOption): ComboboxOption => {
      const name = employeeDisplayName({ name_ar: e.nameAr, name_en: e.nameEn }, locale);
      const dept = localized({ name_ar: e.departmentAr, name_en: e.departmentEn }, 'name', locale);
      const linked = e.linked && e.id !== allowLinkedId;
      return {
        value: e.id,
        label: name,
        description: [e.employeeNumber, dept, linked ? t('linked') : null].filter(Boolean).join(' · '),
        keywords: [e.nameAr ?? '', e.nameEn ?? '', e.employeeNumber ?? ''],
        disabled: linked,
        icon: <EmployeeAvatar name={name} seed={e.id} size="xs" />,
      };
    },
    [allowLinkedId, locale, t],
  );

  const loadOptions = useCallback(
    async (query: string) => {
      const result = await searchEmployeesAction({ q: query });
      if (!result.ok) throw new Error(result.error);
      const rows = result.data ?? [];
      for (const r of rows) cache.current.set(r.id, r);
      return rows.map(toOption);
    },
    [toOption],
  );

  return (
    <Combobox
      id={id}
      value={value}
      onChange={(next, option) => {
        if (!next || !option) return onChange(null);
        onChange({ id: next, label: option.label, description: option.description, option: cache.current.get(next) ?? null });
      }}
      loadOptions={loadOptions}
      selectedOptions={selected ? [{ value: selected.id, label: selected.label, description: selected.description }] : undefined}
      placeholder={t('placeholder')}
      searchPlaceholder={t('search')}
      emptyText={t('empty')}
      disabled={disabled}
      aria-invalid={aria['aria-invalid']}
    />
  );
}
