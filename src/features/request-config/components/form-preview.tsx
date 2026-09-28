'use client';

import { EyeIcon, RotateCcwIcon } from 'lucide-react';
import { NextIntlClientProvider, useLocale, useTimeZone, useTranslations, type AbstractIntlMessages } from 'next-intl';
import { Direction } from 'radix-ui';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SegmentedTabs } from '@/components/shared/link-tabs';
import { safeAction } from '@/components/shared/safe-action';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { loadRequestLookups } from '@/features/requests/actions';
import { RequestFormRenderer } from '@/features/requests/components/request-form-renderer';
import type { FormLookups } from '@/features/requests/types';
import { dir as directionOf, localeNames, type Locale } from '@/lib/i18n/config';
import { formats } from '@/lib/i18n/formats';
import { localized } from '@/lib/i18n/localized';
import type { BuilderField } from '../types';

/** Field types whose options come from the server (leave types, the viewer's dependents). */
const LOOKUP_FIELD_TYPES = new Set(['leave_type', 'dependent']);
const NO_LOOKUPS: FormLookups = { leaveTypes: [], dependents: [] };

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

  // Load the option lookups here (guarded) instead of letting the renderer fetch them itself: a failed
  // request becomes a toast rather than an unhandled rejection, and toggling Preview again retries.
  const resolve = useErrorMessage();
  const needsLookups = active.some((f) => LOOKUP_FIELD_TYPES.has(f.field_type));
  const [lookups, setLookups] = useState<FormLookups | null>(null);
  const onLookupsFailed = useEffectEvent((error: string) => toast.error(resolve(error), { id: 'form-preview-lookups' }));
  useEffect(() => {
    if (!needsLookups || lookups) return;
    let cancelled = false;
    void safeAction(() => loadRequestLookups({ employeeId: null })).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setLookups(result.data);
      else onLookupsFailed(result.ok ? 'errors.generic' : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [needsLookups, lookups]);

  const form = (
    <div dir={directionOf(previewLocale)} lang={previewLocale} className="rounded-xl border border-border bg-background/60 p-4 sm:p-5">
      <p className="mb-4 text-section-title font-semibold text-foreground">{localized(typeName, 'name', previewLocale)}</p>
      <RequestFormRenderer
        fields={active}
        values={values}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        context={{ allowAttachments, lookups: lookups ?? NO_LOOKUPS }}
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
