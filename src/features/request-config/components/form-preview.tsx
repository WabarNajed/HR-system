'use client';

import { EyeIcon, RotateCcwIcon } from 'lucide-react';
import { NextIntlClientProvider, useLocale, useTimeZone, useTranslations, type AbstractIntlMessages } from 'next-intl';
import { Direction } from 'radix-ui';
import { useMemo, useState } from 'react';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { Button } from '@/components/ui/button';
import { RequestFormRenderer } from '@/features/requests/components/request-form-renderer';
import { dir as directionOf, localeNames, type Locale } from '@/lib/i18n/config';
import { formats } from '@/lib/i18n/formats';
import { localized } from '@/lib/i18n/localized';
import type { BuilderField } from '../types';

type Props = {
  fields: BuilderField[];
  typeName: { name_ar: string; name_en: string };
  allowAttachments: boolean;
  /** Messages of the other UI language (so the preview can render in Arabic and English). */
  otherMessages: AbstractIntlMessages;
};

/**
 * Live preview of the unsaved form in Arabic or English, rendered by the same `RequestFormRenderer`
 * the New Request wizard uses. Values typed here are local only — nothing is submitted.
 */
export function FormPreview({ fields, typeName, allowAttachments, otherMessages }: Props) {
  const t = useTranslations('requestConfig.builder.preview');
  const uiLocale = useLocale() as Locale;
  const timeZone = useTimeZone();
  const [previewLocale, setPreviewLocale] = useState<Locale>(uiLocale);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const active = useMemo(
    () => fields.filter((f) => f.is_active !== false).map((f, i) => ({ ...f, sort_order: (i + 1) * 10 })),
    [fields],
  );

  const form = (
    <div dir={directionOf(previewLocale)} lang={previewLocale} className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
      <p className="mb-4 text-section-title font-semibold text-foreground">{localized(typeName, 'name', previewLocale)}</p>
      <RequestFormRenderer
        fields={active}
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        context={{ allowAttachments }}
      />
      {!active.length ? <p className="py-6 text-center text-meta text-muted-foreground">{t('empty')}</p> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-meta text-muted-foreground">
          <EyeIcon className="size-4 text-primary" aria-hidden />
          {t('note')}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setValues({})} disabled={!Object.keys(values).length}>
            <RotateCcwIcon />
            {t('reset')}
          </Button>
          <SegmentedTabs
            size="sm"
            aria-label={t('language')}
            value={previewLocale}
            onValueChange={(v) => setPreviewLocale(v as Locale)}
            items={(['ar', 'en'] as const).map((l) => ({ value: l, label: localeNames[l] }))}
          />
        </div>
      </div>
      {previewLocale === uiLocale ? (
        form
      ) : (
        <NextIntlClientProvider locale={previewLocale} messages={otherMessages} timeZone={timeZone} formats={formats}>
          <Direction.Provider dir={directionOf(previewLocale)}>{form}</Direction.Provider>
        </NextIntlClientProvider>
      )}
    </div>
  );
}
