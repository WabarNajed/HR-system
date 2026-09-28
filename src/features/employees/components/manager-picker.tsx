'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { searchManagerCandidates } from '../actions';

/** Search budget; the Combobox's own (later) timeout stays as a backstop. */
const SEARCH_TIMEOUT_MS = 15_000;

export type ManagerOption = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  job_title_ar?: string | null;
  job_title_en?: string | null;
};

/**
 * Async manager picker: server-side search (Arabic-folded) that excludes the employee and every
 * (indirect) report of theirs, so a reporting cycle can't be picked.
 */
export function ManagerPicker({
  employeeId,
  value,
  onChange,
  current,
  disabled,
  id,
  invalid,
  describedBy,
}: {
  employeeId: string | null;
  value: string;
  onChange: (value: string) => void;
  /** The currently assigned manager (label before any search). */
  current: ManagerOption | null;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations('employees.form');
  const locale = useLocale();

  const toOption = useCallback(
    (m: ManagerOption): ComboboxOption => {
      const name = employeeDisplayName(m, locale) || m.employee_number || '—';
      const job = locale === 'en' ? m.job_title_en || m.job_title_ar : m.job_title_ar || m.job_title_en;
      return {
        value: m.id,
        label: name,
        description: [m.employee_number, job].filter(Boolean).join(' · ') || undefined,
        icon: <EmployeeAvatar name={name} seed={m.id} size="xs" />,
      };
    },
    [locale],
  );

  const loadOptions = useCallback(
    (query: string, signal: AbortSignal) => {
      // A Server Action can't be cancelled, so race it against the Combobox's abort signal: when the
      // Combobox times out, reject so the list shows its error/retry state instead of a stale "no
      // matches". Aborts caused by typing (a newer query) resolve quietly — the Combobox ignores them.
      const started = performance.now();
      const aborted = new Promise<ComboboxOption[]>((resolve, reject) => {
        const onAbort = () => (performance.now() - started >= SEARCH_TIMEOUT_MS - 250 ? reject(new Error('timeout')) : resolve([]));
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      });
      const search = searchManagerCandidates({ employeeId, query }).then((result) => {
        if (!result.ok) throw new Error(result.error);
        return (result.data ?? []).map(toOption);
      });
      return Promise.race([search, aborted]);
    },
    [employeeId, toOption],
  );

  return (
    <Combobox
      id={id}
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      loadOptions={loadOptions}
      timeout={SEARCH_TIMEOUT_MS}
      selectedOptions={current ? [toOption(current)] : []}
      placeholder={t('placeholders.manager')}
      searchPlaceholder={t('placeholders.manager')}
      emptyText={t('hints.noManagerMatches')}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
    />
  );
}
