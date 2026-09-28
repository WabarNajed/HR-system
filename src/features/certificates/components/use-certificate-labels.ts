'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';

type Loose = ((key: string) => string) & { has: (key: string) => boolean };

/** Translated labels for DB enum values (type, language, variant, request status) with raw fallback. */
export function useCertificateLabels() {
  const t = useTranslations('enums') as unknown as Loose;
  const ts = useTranslations('statuses') as unknown as Loose;
  const label = useCallback((group: string, value: string | null | undefined) => {
    if (!value) return '';
    const key = `${group}.${value}`;
    return t.has(key) ? t(key) : value;
  }, [t]);
  // Stable identity: tables list this object in their column `useMemo` dependencies.
  return useMemo(
    () => ({
      type: (v: string | null | undefined) => label('certificateType', v),
      language: (v: string | null | undefined) => label('certificateLanguage', v),
      variant: (v: string | null | undefined) => label('certificateVariant', v),
      requestStatus: (v: string | null | undefined) => (v && ts.has(`request.${v}`) ? ts(`request.${v}`) : (v ?? '')),
    }),
    [label, ts],
  );
}
