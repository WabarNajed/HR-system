'use client';

import { CircleCheckIcon, CircleDashedIcon, SendIcon, ServerIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';
import { sendProviderTestEmail } from '../actions';
import type { EmailProviderStatus } from '../provider';
import { useActionTransition } from '@/components/shared/use-action-transition';

type Props = {
  status: EmailProviderStatus;
  /** Signed-in user's address (test recipient). */
  email: string | null;
  canTest: boolean;
  className?: string;
  compact?: boolean;
};

/** Email delivery status (Resend / SMTP / not configured) with a "send a test to me" action. */
export function ProviderStatus({ status, email, canTest, className, compact = false }: Props) {
  const t = useTranslations('emailTemplates.provider');
  const locale = useLocale() as Locale;
  const resolve = useErrorMessage();
  const [pending, startTransition] = useActionTransition();
  const configured = Boolean(status.provider && status.from);

  const test = () =>
    startTransition(async () => {
      const result = await sendProviderTestEmail({ locale });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      if (result.data?.status === 'sent') toast.success(t('testSent', { email: result.data.to }));
      else toast.warning(resolve(result.message));
    });

  const disabledReason = !canTest ? t('noPermission') : !email ? t('noEmail') : null;

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', configured ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
          {configured ? <CircleCheckIcon className="size-4.5" aria-hidden /> : <CircleDashedIcon className="size-4.5" aria-hidden />}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {t('title')}
            <Badge variant={configured ? 'success' : 'warning'} size="sm">
              {status.provider ? t(`providers.${status.provider}`) : t('providers.none')}
            </Badge>
          </p>
          <p className="mt-1 text-meta text-muted-foreground">
            {!status.provider ? t('notConfigured') : !status.from ? t('fromMissing') : t('configured')}
          </p>
          {!compact && (status.from || status.host) ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {status.from ? (
                <span>
                  {t('from')}{' '}
                  <span dir="ltr" className="font-mono text-foreground">
                    {status.from}
                  </span>
                </span>
              ) : null}
              {status.host ? (
                <span className="inline-flex items-center gap-1">
                  <ServerIcon className="size-3" aria-hidden />
                  <span dir="ltr" className="font-mono">
                    {status.host}
                  </span>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>
      <SimpleTooltip content={disabledReason}>
        <span tabIndex={disabledReason ? 0 : -1} className="shrink-0 self-start sm:self-center">
          <Button variant="outline" size="sm" onClick={test} loading={pending} disabled={Boolean(disabledReason)}>
            <SendIcon className="flip-rtl" />
            {t('sendTest')}
          </Button>
        </span>
      </SimpleTooltip>
    </div>
  );
}
