'use client';

import { BellRingIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { runExpiryCheck } from '../actions';

/** HR "Run expiry check now" — same engine as the daily cron (idempotent). */
export function RunExpiryCheckButton({ className }: { className?: string }) {
  const t = useTranslations('documents');
  const router = useRouter();
  const resolve = useErrorMessage();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className={className}>
          <BellRingIcon />
          {t('actions.runCheck')}
        </Button>
      }
      title={t('runCheck.title')}
      description={t('runCheck.description')}
      confirmLabel={t('runCheck.confirm')}
      onConfirm={async () => {
        const result = await runExpiryCheck({});
        if (!result.ok) {
          toast.error(resolve(result.error));
          return false;
        }
        toast.success(t('runCheck.result', { items: result.data?.items ?? 0 }));
        router.refresh();
        return true;
      }}
    />
  );
}
