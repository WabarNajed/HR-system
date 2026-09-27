'use client';

import {
  KeyRoundIcon,
  Link2Icon,
  Link2OffIcon,
  MailPlusIcon,
  MoreHorizontalIcon,
  PowerIcon,
  PowerOffIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UserRoundXIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useState, useTransition } from 'react';
import { Combobox } from '@/components/shared/combobox';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { ErrorState } from '@/components/shared/error-state';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { SimpleTooltip } from '@/components/ui/tooltip';
import {
  linkEmployeeAction,
  resendInvitationAction,
  searchUnlinkedUsersAction,
  sendPasswordResetAction,
  setUserStatusAction,
  unlinkEmployeeAction,
} from '../actions';
import type { UserAbilities } from '../queries';
import type { PortalAccess, RoleOption } from '../types';
import { InviteUserDialog } from './invite-user-dialog';
import { RelativeTime } from './relative-time';
import { RoleBadges, useRoleLookup } from './role-badges';
import { UserStatus } from './user-actions';
import { EditRolesDialog, type DialogUser } from './user-dialogs';
import { useActionFeedback } from './use-action-feedback';

type PortalAccessPanelProps = {
  employeeId: string;
  employeeEmail: string | null;
  employeeName: string | null;
  /** `null` when loading failed. */
  access: PortalAccess | null;
  roles: RoleOption[];
  abilities: UserAbilities;
};

export function PortalAccessPanel({ employeeId, employeeEmail, employeeName, access, roles, abilities }: PortalAccessPanelProps) {
  const t = useTranslations('users.portalAccess');
  const tu = useTranslations('users');
  const tr = useTranslations('users.reasons');
  const roleLabel = useRoleLookup(roles);
  const run = useActionFeedback();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [rolesUser, setRolesUser] = useState<DialogUser | null>(null);
  const [confirm, setConfirm] = useState<'disable' | 'enable' | 'unlink' | null>(null);
  const [pending, startTransition] = useTransition();

  if (!access) {
    return (
      <SectionCard title={t('title')} icon={<KeyRoundIcon />}>
        <ErrorState variant="inline" description={t('loadError')} />
      </SectionCard>
    );
  }

  const user = access.user;
  const protectedSuper = Boolean(user?.roles.includes('super_admin')) && !abilities.isSuperAdmin;

  if (!user) {
    return (
      <SectionCard title={t('title')} description={t('description')} icon={<KeyRoundIcon />}>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border px-4 py-4 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UserRoundXIcon className="size-[1.125rem]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground">{t('noAccess')}</div>
            <p className="text-meta text-muted-foreground">{t('noAccessHint')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {abilities.canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>
                <Link2Icon />
                {t('linkExisting')}
              </Button>
            ) : null}
            <SimpleTooltip content={abilities.canInvite ? null : tr('cannotInvite')}>
              <span tabIndex={abilities.canInvite ? -1 : 0}>
                <Button size="sm" onClick={() => setInviteOpen(true)} disabled={!abilities.canInvite}>
                  <UserPlusIcon />
                  {t('invite')}
                </Button>
              </span>
            </SimpleTooltip>
          </div>
        </div>
        {abilities.canInvite ? (
          <InviteUserDialog
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            roles={roles}
            isSuperAdmin={abilities.isSuperAdmin}
            lockEmployee
            defaults={{ email: employeeEmail, fullName: employeeName, employee: { id: employeeId, label: employeeName ?? '' } }}
          />
        ) : null}
        <LinkUserDialog open={linkOpen} onOpenChange={setLinkOpen} employeeId={employeeId} employeeName={employeeName} />
      </SectionCard>
    );
  }

  const name = user.fullName?.trim() || user.email || '—';
  const menu =
    abilities.canEdit || abilities.canAdminister ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={tu('actionsLabel')} disabled={pending}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {abilities.canAdminister ? (
            <DropdownMenuItem
              disabled={protectedSuper}
              title={protectedSuper ? tr('superAdminOnly') : undefined}
              onSelect={() => setRolesUser({ id: user.id, name, email: user.email, roles: user.roles, isSelf: user.isSelf })}
            >
              <ShieldCheckIcon />
              {tu('actions.editRoles')}
            </DropdownMenuItem>
          ) : null}
          {abilities.canEdit ? (
            <>
              {user.status === 'active' ? (
                user.invitationPending ? (
                  <DropdownMenuItem onSelect={() => startTransition(async () => void (await run(resendInvitationAction({ userId: user.id }), { refresh: false })))}>
                    <MailPlusIcon />
                    {tu('actions.resendInvitation')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => startTransition(async () => void (await run(sendPasswordResetAction({ userId: user.id }), { refresh: false })))}>
                    <KeyRoundIcon />
                    {tu('actions.sendPasswordReset')}
                  </DropdownMenuItem>
                )
              ) : null}
              <DropdownMenuItem disabled={protectedSuper} title={protectedSuper ? tr('superAdminOnly') : undefined} onSelect={() => setConfirm('unlink')}>
                <Link2OffIcon />
                {tu('actions.unlinkEmployee')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.status === 'disabled' ? (
                <DropdownMenuItem disabled={protectedSuper} title={protectedSuper ? tr('superAdminOnly') : undefined} onSelect={() => setConfirm('enable')}>
                  <PowerIcon />
                  {tu('actions.enable')}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  disabled={user.isSelf || protectedSuper}
                  title={user.isSelf ? tr('self') : protectedSuper ? tr('superAdminOnly') : undefined}
                  onSelect={() => setConfirm('disable')}
                >
                  <PowerOffIcon />
                  {tu('actions.disable')}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <SectionCard title={t('title')} description={t('linkedDescription')} icon={<KeyRoundIcon />} actions={menu}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <EmployeeAvatar name={name} seed={user.id} size="md" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium text-foreground">{name}</div>
            <bdi dir="ltr" className="block truncate text-meta text-muted-foreground">
              {user.email}
            </bdi>
          </div>
          <UserStatus user={user} />
        </div>
        <dl className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">{tu('columns.roles')}</dt>
            <dd className="mt-1">
              <RoleBadges roles={user.roles} label={roleLabel} max={4} emptyLabel={tu('noRoles')} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{tu('columns.lastLogin')}</dt>
            <dd className="mt-1 text-sm text-foreground">
              {user.lastLoginAt ? <RelativeTime value={user.lastLoginAt} /> : <span className="text-faint-foreground">{tu('never')}</span>}
            </dd>
          </div>
        </dl>
        {abilities.canEdit || abilities.canAdminister ? (
          <Button asChild variant="link" size="sm" className="h-auto self-start px-0">
            <Link href={`/settings/users?q=${encodeURIComponent(user.email ?? '')}`}>{t('manageInUsers')}</Link>
          </Button>
        ) : null}
      </div>

      <EditRolesDialog user={rolesUser} roles={roles} isSuperAdmin={abilities.isSuperAdmin} onOpenChange={(o) => !o && setRolesUser(null)} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant={confirm === 'enable' ? 'default' : 'danger'}
        title={
          confirm === 'unlink' ? tu('confirm.unlinkTitle') : confirm === 'enable' ? tu('confirm.enableTitle', { name }) : tu('confirm.disableTitle', { name })
        }
        description={
          confirm === 'unlink' ? tu('confirm.unlinkDescription', { name }) : confirm === 'enable' ? tu('confirm.enableDescription') : tu('confirm.disableDescription')
        }
        confirmLabel={confirm === 'unlink' ? tu('actions.unlinkEmployee') : confirm === 'enable' ? tu('actions.enable') : tu('actions.disable')}
        onConfirm={async () => {
          const result =
            confirm === 'unlink'
              ? await run(unlinkEmployeeAction({ userId: user.id }))
              : await run(setUserStatusAction({ userId: user.id, status: confirm === 'enable' ? 'active' : 'disabled' }));
          return result.ok;
        }}
      />
    </SectionCard>
  );
}

/** Link an existing portal account (without an employee) to this employee. */
function LinkUserDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string | null;
}) {
  const t = useTranslations('users.portalAccess');
  const tc = useTranslations('common');
  const tStatus = useTranslations('statuses.profile');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState<string | null>(null);

  const loadOptions = useCallback(
    async (q: string) => {
      const result = await searchUnlinkedUsersAction({ q });
      if (!result.ok) throw new Error(result.error);
      return (result.data ?? []).map((u) => ({
        value: u.id,
        label: u.fullName?.trim() || u.email || '—',
        description: [u.email, u.status === 'disabled' ? tStatus('disabled') : null].filter(Boolean).join(' · '),
        keywords: [u.email ?? ''],
        icon: <EmployeeAvatar name={u.fullName?.trim() || u.email || '?'} seed={u.id} size="xs" />,
      }));
    },
    [tStatus],
  );

  const save = () =>
    startTransition(async () => {
      if (!userId) return;
      const result = await run(linkEmployeeAction({ userId, employeeId }));
      if (result.ok) {
        setUserId(null);
        onOpenChange(false);
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('linkTitle')}</DialogTitle>
          <DialogDescription>{t('linkDescription', { name: employeeName ?? '' })}</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-1.5 pb-4">
          <Label htmlFor="link-user">{t('account')}</Label>
          <Combobox
            id="link-user"
            value={userId}
            onChange={(v) => setUserId(v)}
            loadOptions={loadOptions}
            placeholder={t('accountPlaceholder')}
            emptyText={t('noAccounts')}
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">{t('linkHint')}</p>
        </DialogBody>
        <DialogFooter className="mt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={save} loading={pending} disabled={!userId} className="min-w-28">
            {!pending ? <Link2Icon /> : null}
            {t('linkSubmit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
