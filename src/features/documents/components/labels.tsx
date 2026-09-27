'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { bandTone, daysLeft, expiryBand, type ExpiryBand } from '../constants';

type Loose = { has: (k: string) => boolean; (k: string, v?: Record<string, string | number>): string };

/** `enums.documentType.<type>` with a safe fallback for unknown DB values. */
export function useDocumentTypeLabel() {
  const t = useTranslations('enums.documentType') as unknown as Loose;
  return useCallback((type: string | null | undefined) => (type ? (t.has(type) ? t(type) : type) : ''), [t]);
}

/** Label of an expiry item: Iqama / National ID / Passport / Contract / Insurance / <document type>. */
export function useExpiryItemLabel() {
  const t = useTranslations('documents.expiry.kinds') as unknown as Loose;
  const docType = useDocumentTypeLabel();
  return useCallback(
    (item: { kind: string | null; id_type?: string | null; subject?: string | null; document_type?: string | null }) => {
      if (item.kind === 'document') return docType(item.document_type) || t('document');
      if (item.kind === 'iqama' && item.subject !== 'dependent' && item.id_type === 'national_id') return t('nationalId');
      return item.kind && t.has(item.kind) ? t(item.kind) : (item.kind ?? '');
    },
    [t, docType],
  );
}

const TONE_VARIANT: Record<ReturnType<typeof bandTone>, BadgeVariant> = {
  danger: 'danger',
  warning: 'warning',
  info: 'info',
  success: 'success',
  neutral: 'neutral',
};

/** "12 days left" / "Expired 3 days ago" pill, colored by band. `today` comes from the server. */
export function ExpiryBadge({
  date,
  today,
  size = 'sm',
  className,
}: {
  date: string | null | undefined;
  today: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('documents.expiry');
  const days = daysLeft(date, today);
  if (days === null) return null;
  const band = expiryBand(days);
  const label = days < 0 ? t('expiredAgo', { count: -days }) : t('daysLeft', { count: days });
  return (
    <Badge variant={TONE_VARIANT[bandTone(band)]} size={size} dot className={className}>
      {label}
    </Badge>
  );
}

/** Band filter options (translated). */
export function useBandOptions(bands: readonly (ExpiryBand | 'none')[]) {
  const t = useTranslations('documents.bands');
  return bands.map((band) => ({ value: band, label: t(band) }));
}
