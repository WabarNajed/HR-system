'use client';

import { PlusIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { RoleWithPermissions } from '../queries';
import { RoleDialog } from './role-dialog';

/** Page-header "New role" action (disabled with the reason when the viewer can't administer roles). */
export function NewRoleButton({ roles, isSuperAdmin, disabledReason }: { roles: RoleWithPermissions[]; isSuperAdmin: boolean; disabledReason: string | null }) {
  const t = useTranslations('roles.create');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const button = (
    <Button onClick={() => setOpen(true)} disabled={Boolean(disabledReason)}>
      <PlusIcon />
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
      {!disabledReason ? (
        <RoleDialog
          mode={open ? 'create' : null}
          role={null}
          roles={roles}
          isSuperAdmin={isSuperAdmin}
          onOpenChange={setOpen}
          onCreated={(key) => router.push(`${pathname}?role=${key}`, { scroll: false })}
        />
      ) : null}
    </>
  );
}
