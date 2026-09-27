'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn, normalizeHex } from '@/lib/utils';

/** Curated brand-safe presets (teal, gold, blues, greens, neutrals). */
export const COLOR_PRESETS = [
  '#0f5e6b',
  '#0e7490',
  '#1f6fd1',
  '#3949ab',
  '#6d28d9',
  '#b8862f',
  '#b25e09',
  '#c8322b',
  '#be185d',
  '#12805c',
  '#4d7c0f',
  '#334155',
];

export type ColorPickerProps = {
  /** Hex color `#rrggbb` (or null). */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  presets?: string[];
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
};

/** Hex input + native swatch + presets. Emits normalized lowercase `#rrggbb` or null. */
export function ColorPicker({ value, onChange, presets = COLOR_PRESETS, disabled, id, className, ...aria }: ColorPickerProps) {
  const t = useTranslations('common.colorPicker');
  const autoId = useId();
  const inputId = id ?? autoId;
  const [text, setText] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  // Re-sync the text field when the value changes from outside (derived-state pattern).
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value ?? '');
    setInvalid(false);
  }

  const commit = (raw: string) => {
    if (!raw.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const hex = normalizeHex(raw);
    setInvalid(!hex);
    if (hex) onChange(hex);
  };

  const current = normalizeHex(value) ?? '#ffffff';

  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="color-picker">
      <div className="flex items-center gap-2">
        <label
          className={cn(
            'relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs focus-within:ring-[3px] focus-within:ring-ring/40',
            disabled && 'pointer-events-none opacity-60',
          )}
          style={{ backgroundColor: normalizeHex(value) ?? 'transparent' }}
        >
          <span className="sr-only">{t('label')}</span>
          <input
            type="color"
            value={current}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <Input
          id={inputId}
          dir="ltr"
          value={text}
          disabled={disabled}
          placeholder={t('hexPlaceholder')}
          maxLength={7}
          spellCheck={false}
          aria-invalid={invalid || aria['aria-invalid'] || undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit(text);
            }
          }}
          className="w-32 font-mono text-meta uppercase"
        />
      </div>
      {invalid ? <p className="text-xs font-medium text-danger">{t('invalid')}</p> : null}
      {presets.length ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('presets')}>
          {presets.map((p) => {
            const active = normalizeHex(value) === normalizeHex(p);
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                aria-label={p}
                aria-pressed={active}
                onClick={() => onChange(normalizeHex(p))}
                className={cn(
                  'size-6 rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:border-white/15',
                  active && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                )}
                style={{ backgroundColor: p }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
