'use client';

import { CheckCheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { completeCertificateRequest } from '../actions';
import { useActionToast } from './use-action-toast';

/** Completes the certificate request (disabled with a reason until a valid certificate exists). */
export function CompleteRequestButton({ requestId, disabled }: { requestId: string; disabled: boolean }) {
  const t = useTranslations('certificates.panel');
  const { run } = useActionToast();
  const [pending, startTransition] = useTransition();
  const button = (
    <Button
      variant="secondary"
      loading={pending}
      disabled={disabled}
      onClick={() => startTransition(async () => void (await run(completeCertificateRequest({ requestId }))))}
    >
      <CheckCheckIcon />
      {t('complete')}
    </Button>
  );
  return disabled ? (
    <SimpleTooltip content={t('completeDisabled')}>
      <span tabIndex={0} className="inline-flex">
        {button}
      </span>
    </SimpleTooltip>
  ) : (
    <SimpleTooltip content={t('completeHint')}>{button}</SimpleTooltip>
  );
}
