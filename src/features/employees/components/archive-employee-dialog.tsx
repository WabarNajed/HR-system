'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useErrorMessage } from '@/components/ui/form';
import { archiveEmployee, restoreEmployee } from '../actions';

export type ArchiveTarget = { id: string; name: string; archived: boolean };

/** Archive / restore confirmation (controlled). Toasts the outcome and refreshes the route. */
export function ArchiveEmployeeDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: ArchiveTarget | null;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const t = useTranslations('employees.archive');
  const resolve = useErrorMessage();
  const router = useRouter();
  const restoring = Boolean(target?.archived);

  return (
    <ConfirmDialog
      open={Boolean(target)}
      onOpenChange={onOpenChange}
      variant={restoring ? 'default' : 'danger'}
      title={target ? t(restoring ? 'restoreTitle' : 'title', { name: target.name }) : ''}
      description={restoring ? t('restoreDescription') : t('description')}
      confirmLabel={restoring ? t('restoreConfirm') : t('confirm')}
      onConfirm={async () => {
        if (!target) return;
        const result = restoring ? await restoreEmployee({ id: target.id }) : await archiveEmployee({ id: target.id });
        if (!result.ok) {
          toast.error(resolve(result.error));
          return false;
        }
        toast.success(resolve(result.message));
        onDone?.();
        router.refresh();
      }}
    />
  );
}
