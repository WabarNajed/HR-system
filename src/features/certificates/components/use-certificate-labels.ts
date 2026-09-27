'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

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
  return {
    type: useCallback((v: string | null | undefined) => label('certificateType', v), [label]),
    language: useCallback((v: string | null | undefined) => label('certificateLanguage', v), [label]),
    variant: useCallback((v: string | null | undefined) => label('certificateVariant', v), [label]),
    requestStatus: useCallback((v: string | null | undefined) => (v && ts.has(`request.${v}`) ? ts(`request.${v}`) : v ?? ''), [ts]),
  };
}
