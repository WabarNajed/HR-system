'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
  /** Called with the new archived state after a successful archive/restore. */
  onDone?: (archived: boolean) => void;
}) {
  const t = useTranslations('employees.archive');
  const resolve = useErrorMessage();
  const router = useRouter();
  // Keep the last target while the dialog animates out (title/description must not flip mid-close).
  const [shown, setShown] = useState<ArchiveTarget | null>(target);
  if (target && target !== shown) setShown(target);
  const current = target ?? shown;
  const restoring = Boolean(current?.archived);

  return (
    <ConfirmDialog
      open={Boolean(target)}
      onOpenChange={onOpenChange}
      variant={restoring ? 'default' : 'danger'}
      title={current ? t(restoring ? 'restoreTitle' : 'title', { name: current.name }) : ''}
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
        onDone?.(!restoring);
        router.refresh();
      }}
    />
  );
}
