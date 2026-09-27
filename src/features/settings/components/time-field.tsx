'use client';

import { useMemo } from 'react';
import { Combobox, type ComboboxOption } from '@/components/shared/combobox';

const STEP_MINUTES = 15;

/** `HH:MM` slots every 15 minutes (24-hour clock, identical in both languages). */
const SLOTS: string[] = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, i) => {
  const minutes = i * STEP_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

export type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

/**
 * Working-hours picker: searchable list of 24-hour `HH:MM` slots. Replaces `<input type="time">`,
 * whose 12-hour AM/PM rendering follows the browser/OS locale instead of the portal language.
 * A stored value off the 15-minute grid (e.g. `08:10`) stays selectable.
 */
export function TimeField({ value, onChange, onBlur, disabled, searchPlaceholder, id, className, ...aria }: TimeFieldProps) {
  const options = useMemo<ComboboxOption[]>(() => {
    const slots = value && !SLOTS.includes(value) ? [...SLOTS, value].sort() : SLOTS;
    return slots.map((slot) => ({ value: slot, label: slot }));
  }, [value]);

  return (
    <Combobox
      id={id}
      options={options}
      value={value || null}
      onChange={(next) => {
        if (next) onChange(next);
        onBlur?.();
      }}
      clearable={false}
      disabled={disabled}
      searchPlaceholder={searchPlaceholder}
      className={className}
      aria-invalid={aria['aria-invalid']}
      aria-describedby={aria['aria-describedby']}
    />
  );
}
