'use client';

import { AwardIcon, BanIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import type { IssuedCertificateRow } from '../types';
import { certificateDownloadUrl, certificateVerifyPath, certificateVerifyUrl } from './certificate-links';
import { RevokeCertificateDialog } from './revoke-certificate-dialog';
import { useCertificateLabels } from './use-certificate-labels';

/** Compact list of issued certificates with download / verify / copy / revoke actions. */
export function IssuedCertificateList({
  certificates,
  canRevoke,
  showTemplate = true,
  className,
}: {
  certificates: IssuedCertificateRow[];
  canRevoke: boolean;
  showTemplate?: boolean;
  className?: string;
}) {
  const t = useTranslations('certificates');
  const tc = useTranslations('common');
  const fmt = useDateFormat();
  const labels = useCertificateLabels();
  const [revoking, setRevoking] = useState<IssuedCertificateRow | null>(null);

  return (
    <>
      <ul className={cn('divide-y divide-border overflow-hidden rounded-md border border-border bg-card', className)}>
        {certificates.map((c) => {
          const download = certificateDownloadUrl(c.storage_path);
          const revoked = c.status !== 'valid';
          return (
            <li key={c.id} className="flex flex-col gap-3 px-3.5 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-md',
                    revoked ? 'bg-muted text-muted-foreground' : 'bg-secondary-soft text-secondary-soft-foreground',
                  )}
                >
                  <AwardIcon className="size-4.5" aria-hidden />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <bdi dir="ltr" className={cn('numeric font-semibold', revoked && 'text-muted-foreground line-through decoration-1')}>
                      {c.certificate_number}
                    </bdi>
                    <StatusBadge domain="certificate" status={c.status} size="sm" />
                  </div>
                  <div className="mt-1 truncate text-meta text-muted-foreground">
                    {showTemplate ? `${labels.type(c.certificate_type)} · ` : ''}
                    <span className="numeric">{fmt.date(c.issue_date)}</span> · {labels.language(c.language)}
                  </div>
                  {revoked && c.revoke_reason ? <div className="mt-1 text-meta text-danger">{c.revoke_reason}</div> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 ps-12 sm:ps-0">
                {download && !revoked ? (
                  <Button asChild size="sm" variant="outline">
                    <a href={download}>
                      <DownloadIcon />
                      {t('actions.download')}
                    </a>
                  </Button>
                ) : null}
                <SimpleTooltip content={t('actions.openVerification')}>
                  <Button asChild size="icon-sm" variant="ghost" aria-label={t('actions.openVerification')}>
                    <a href={certificateVerifyPath(c.certificate_number)} target="_blank" rel="noopener noreferrer">
                      <ExternalLinkIcon />
                    </a>
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip content={t('actions.copyVerifyLink')}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t('actions.copyVerifyLink')}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(certificateVerifyUrl(c.certificate_number));
                        toast.success(t('toast.linkCopied'));
                      } catch {
                        toast.error(tc('copyToClipboard'));
                      }
                    }}
                  >
                    <CopyIcon />
                  </Button>
                </SimpleTooltip>
                {canRevoke && !revoked ? (
                  <SimpleTooltip content={t('actions.revoke')}>
                    <Button size="icon-sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" aria-label={t('actions.revoke')} onClick={() => setRevoking(c)}>
                      <BanIcon />
                    </Button>
                  </SimpleTooltip>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <RevokeCertificateDialog certificate={revoking} onOpenChange={(open) => !open && setRevoking(null)} />
    </>
  );
}
