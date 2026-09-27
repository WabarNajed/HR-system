import { useTranslations } from 'next-intl';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { expiryBucket, type ExpiryBucket } from '@/lib/dates';

const LABEL: Record<ExpiryBucket, 'expired' | 'within7' | 'within14' | 'within30' | 'within60' | 'within90' | 'valid'> = {
  expired: 'expired',
  d7: 'within7',
  d14: 'within14',
  d30: 'within30',
  d60: 'within60',
  d90: 'within90',
  ok: 'valid',
};

const TONE: Record<ExpiryBucket, BadgeVariant> = {
  expired: 'danger',
  d7: 'danger',
  d14: 'warning',
  d30: 'warning',
  d60: 'secondary',
  d90: 'info',
  ok: 'success',
};

/**
 * Expiry bucket pill (Expired · Within 7/14/30/60/90 days · Valid) for Iqama, passport, contract and
 * insurance dates. `hideValid` keeps dense tables quiet for dates far in the future.
 */
export function ExpiryBadge({
  date,
  today,
  hideValid = false,
  size = 'sm',
  className,
}: {
  date: string | null | undefined;
  today?: string;
  hideValid?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('enums.expiryBucket');
  const bucket = date ? expiryBucket(date, today) : null;
  if (!bucket || (hideValid && bucket === 'ok')) return null;
  return (
    <Badge variant={TONE[bucket]} size={size} dot className={className}>
      {t(LABEL[bucket])}
    </Badge>
  );
}
