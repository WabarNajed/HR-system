'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** Arabic + English inputs, each tagged with its language. */
export function BilingualInput({
  label,
  valueAr,
  valueEn,
  onChange,
  disabled,
  multiline,
  required,
}: {
  label: string;
  valueAr: string;
  valueEn: string;
  onChange: (ar: string, en: string) => void;
  disabled: boolean;
  multiline?: boolean;
  required?: boolean;
}) {
  const tc = useTranslations('common');
  const id = useId();
  const rows: { lang: 'ar' | 'en'; value: string; tag: string }[] = [
    { lang: 'ar', value: valueAr, tag: tc('arabic') },
    { lang: 'en', value: valueEn, tag: tc('english') },
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const invalid = required && !r.value.trim();
        const common = {
          id: `${id}-${r.lang}`,
          value: r.value,
          dir: r.lang === 'ar' ? 'rtl' : 'ltr',
          lang: r.lang,
          disabled,
          'aria-label': `${label} · ${r.tag}`,
          'aria-invalid': invalid || undefined,
          onChange: (e: { target: { value: string } }) => (r.lang === 'ar' ? onChange(e.target.value, valueEn) : onChange(valueAr, e.target.value)),
        } as const;
        return (
          <div key={r.lang} className="flex items-start gap-2">
            <span className="mt-2 w-7 shrink-0 rounded bg-muted py-0.5 text-center text-[0.625rem] font-semibold text-muted-foreground uppercase">{r.lang}</span>
            {multiline ? <Textarea {...common} rows={2} className="min-h-14 text-sm" /> : <Input {...common} className="h-8 text-sm" />}
          </div>
        );
      })}
    </div>
  );
}

