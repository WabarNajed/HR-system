'use client';

import { Link2Icon, ShieldCheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { linkEmployeeAction, setUserRolesAction } from '../actions';
import type { RoleOption } from '../types';
import { EmployeePicker } from './employee-picker';
import { RoleChecklist } from './role-checklist';
import { useActionFeedback } from './use-action-feedback';

export type DialogUser = {
  id: string;
  name: string;
  email: string | null;
  roles: string[];
  isSelf: boolean;
};

/** Edit a user's roles (RPC `set_user_roles`; only super admins may grant/revoke Super Admin). */
export function EditRolesDialog({
  user,
  roles,
  isSuperAdmin,
  onOpenChange,
}: {
  user: DialogUser | null;
  roles: readonly RoleOption[];
  isSuperAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  // Keep the last user while the dialog animates out.
  const [shown, setShown] = useState(user);
  if (user && user !== shown) setShown(user);
  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        {shown ? (
          <EditRolesBody
            key={shown.id}
            user={shown}
            roles={roles}
            isSuperAdmin={isSuperAdmin}
            pending={pending}
            startTransition={startTransition}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditRolesBody({
  user,
  roles,
  isSuperAdmin,
  pending,
  startTransition,
  onOpenChange,
}: {
  user: DialogUser;
  roles: readonly RoleOption[];
  isSuperAdmin: boolean;
  pending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('users.editRoles');
  const tc = useTranslations('common');
  const run = useActionFeedback();
  const [value, setValue] = useState<string[]>(user.roles);
  const dirty = [...value].sort().join() !== [...user.roles].sort().join();
  const lockedSuper = user.roles.includes('super_admin') && !isSuperAdmin;

  const save = () =>
    startTransition(async () => {
      const result = await run(setUserRolesAction({ userId: user.id, roleKeys: value }));
      if (result.ok) onOpenChange(false);
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description', { name: user.name })}</DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3 pb-4">
        {lockedSuper ? (
          <Alert variant="warning">
            <ShieldCheckIcon />
            <AlertDescription>{t('superAdminProtected')}</AlertDescription>
          </Alert>
        ) : null}
        {user.isSelf ? (
          <Alert variant="info">
            <ShieldCheckIcon />
            <AlertDescription>{t('selfWarning')}</AlertDescription>
          </Alert>
        ) : null}
        <RoleChecklist roles={roles} value={value} onChange={setValue} isSuperAdmin={isSuperAdmin} disabled={pending || lockedSuper} />
        {!value.length ? <p className="text-xs text-warning">{t('noRoles')}</p> : null}
      </DialogBody>
      <DialogFooter className="mt-0">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          {tc('cancel')}
        </Button>
        <Button onClick={save} loading={pending} disabled={!dirty || lockedSuper} className="min-w-28">
          {tc('saveChanges')}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Link a portal account to an employee record (RPC `set_user_employee`). */
export function LinkEmployeeDialog({ user, onOpenChange }: { user: DialogUser | null; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations('users.link');
  const tc = useTranslations('common');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [prevUser, setPrevUser] = useState(user);
  if (user !== prevUser) {
    setPrevUser(user);
    setEmployeeId(null);
  }

  const save = () =>
    startTransition(async () => {
      if (!user || !employeeId) return;
      const result = await run(linkEmployeeAction({ userId: user.id, employeeId }));
      if (result.ok) onOpenChange(false);
    });

  return (
    <Dialog open={Boolean(user)} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { name: user?.name ?? '' })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-2 pb-4">
          <Label htmlFor="link-employee">{t('employee')}</Label>
          <EmployeePicker id="link-employee" value={employeeId} onChange={(p) => setEmployeeId(p?.id ?? null)} disabled={pending} />
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </DialogBody>
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={save} loading={pending} disabled={!employeeId} className="min-w-28">
            {!pending ? <Link2Icon /> : null}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
