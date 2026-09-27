'use client';

import { UserPlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { RoleOption } from '../types';
import { InviteUserDialog } from './invite-user-dialog';

/** "Invite user" button + dialog; disabled with a tooltip when the viewer can't invite. */
export function InviteUserButton({
  roles,
  isSuperAdmin,
  disabledReason,
  size = 'md',
}: {
  roles: RoleOption[];
  isSuperAdmin: boolean;
  disabledReason?: string | null;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('users.invite');
  const [open, setOpen] = useState(false);
  const button = (
    <Button size={size} onClick={() => setOpen(true)} disabled={Boolean(disabledReason)}>
      <UserPlusIcon />
      {t('open')}
    </Button>
  );
  return (
    <>
      {disabledReason ? (
        <SimpleTooltip content={disabledReason}>
          <span tabIndex={0}>{button}</span>
        </SimpleTooltip>
      ) : (
        button
      )}
      {!disabledReason ? <InviteUserDialog open={open} onOpenChange={setOpen} roles={roles} isSuperAdmin={isSuperAdmin} /> : null}
    </>
  );
}
