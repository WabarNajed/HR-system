'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { CircleDotIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { actionsColumn, DataTable, DataTableColumnHeader, type FilterDef } from '@/components/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { Badge } from '@/components/ui/badge';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { UserAbilities } from '../queries';
import { resendInvitationAction, sendPasswordResetAction, setUserStatusAction, unlinkEmployeeAction } from '../actions';
import type { RoleOption, UserRow } from '../types';
import { InviteUserButton } from './invite-user-button';
import { RelativeTime } from './relative-time';
import { RoleBadges, useRoleLookup } from './role-badges';
import { UserDetailsSheet } from './user-details-sheet';
import { displayName, toDialogUser, useUserActions, UserStatus, type UserActionKind } from './user-actions';
import { EditRolesDialog, LinkEmployeeDialog, type DialogUser } from './user-dialogs';
import { useActionFeedback } from './use-action-feedback';

type UsersTableProps = {
  rows: UserRow[];
  total: number;
  roles: RoleOption[];
  abilities: UserAbilities;
};

export function UsersTable({ rows, total, roles, abilities }: UsersTableProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const roleLabel = useRoleLookup(roles);
  const run = useActionFeedback();
  const actionsFor = useUserActions(abilities);

  const [details, setDetails] = useState<UserRow | null>(null);
  const [rolesUser, setRolesUser] = useState<DialogUser | null>(null);
  const [linkUser, setLinkUser] = useState<DialogUser | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'disable' | 'enable' | 'unlink'; user: UserRow } | null>(null);

  const open = (kind: UserActionKind, user: UserRow) => {
    if (kind === 'details') setDetails(user);
    else if (kind === 'roles') setRolesUser(toDialogUser(user));
    else if (kind === 'link') setLinkUser(toDialogUser(user));
    else if (kind === 'disable' || kind === 'enable' || kind === 'unlink') setConfirm({ kind, user });
    else if (kind === 'resend') void run(resendInvitationAction({ userId: user.id }), { refresh: false });
    else if (kind === 'reset') void run(sendPasswordResetAction({ userId: user.id }), { refresh: false });
  };

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (r) => displayName(r),
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.user')} />,
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <EmployeeAvatar name={displayName(u)} seed={u.id} size="md" />
              <div className="min-w-0 leading-tight">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="max-w-[11rem] truncate font-medium text-foreground" title={displayName(u)}>{displayName(u)}</span>
                  {u.isSelf ? (
                    <Badge variant="outline" size="sm">
                      {t('you')}
                    </Badge>
                  ) : null}
                </div>
                <bdi dir="ltr" className="mt-0.5 block max-w-[14rem] truncate text-xs text-muted-foreground">
                  {u.email}
                </bdi>
              </div>
            </div>
          );
        },
        meta: { label: t('columns.user'), width: '14rem' },
        enableHiding: false,
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.email')} />,
        cell: ({ row }) => (
          <bdi dir="ltr" className="block max-w-[16rem] truncate text-meta text-foreground">
            {row.original.email ?? '—'}
          </bdi>
        ),
        meta: { label: t('columns.email'), defaultHidden: true },
      },
      {
        id: 'employee',
        header: t('columns.employee'),
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original.employee;
          if (!e) return <span className="text-meta text-faint-foreground">{t('notLinked')}</span>;
          return (
            <Link
              href={`/employees/${e.id}`}
              data-no-row-click
              onClick={(ev) => ev.stopPropagation()}
              className="group flex min-w-0 flex-col leading-tight outline-none"
            >
              <span className="max-w-[9rem] truncate text-meta font-medium text-foreground group-hover:text-primary group-hover:underline group-focus-visible:underline">
                {employeeDisplayName(e, locale)}
              </span>
              {e.employee_number ? <bdi className="text-xs text-muted-foreground numeric">{e.employee_number}</bdi> : null}
            </Link>
          );
        },
        meta: { label: t('columns.employee') },
      },
      {
        id: 'roles',
        header: t('columns.roles'),
        enableSorting: false,
        cell: ({ row }) => <RoleBadges roles={row.original.roles} label={roleLabel} max={1} emptyLabel={t('noRoles')} className="flex-nowrap" />,
        meta: { label: t('columns.roles') },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title={tc('status')} />,
        cell: ({ row }) => <UserStatus user={row.original} />,
        meta: { label: tc('status') },
      },
      {
        id: 'last_login',
        accessorKey: 'lastLoginAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.lastLogin')} />,
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            <RelativeTime value={row.original.lastLoginAt} className="text-meta text-foreground" />
          ) : (
            <span className="text-meta text-faint-foreground">{t('never')}</span>
          ),
        meta: { label: t('columns.lastLogin') },
      },
      {
        id: 'created',
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('columns.created')} />,
        cell: ({ row }) => <RelativeTime value={row.original.createdAt} className="text-meta text-muted-foreground" />,
        meta: { label: t('columns.created'), defaultHidden: true },
      },
      actionsColumn<UserRow>((u) => actionsFor(u, open)),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` is stable enough (state setters)
    [t, tc, locale, roleLabel, actionsFor],
  );

  const filters: FilterDef<UserRow>[] = [
    {
      key: 'role',
      title: t('filters.role'),
      icon: ShieldCheckIcon,
      options: roles.map((r) => ({ value: r.key, label: localized({ name_ar: r.nameAr, name_en: r.nameEn }, 'name', locale), count: r.memberCount })),
    },
    {
      key: 'status',
      title: tc('status'),
      icon: CircleDotIcon,
      options: [
        { value: 'active', label: t('statusFilter.active') },
        { value: 'invited', label: t('status.invited') },
        { value: 'disabled', label: t('statusFilter.disabled') },
        { value: 'pending', label: t('statusFilter.pending') },
        { value: 'info_requested', label: t('statusFilter.info_requested') },
        { value: 'rejected', label: t('statusFilter.rejected') },
      ],
    },
  ];

  const inviteButton = abilities.canInvite ? <InviteUserButton roles={roles} isSuperAdmin={abilities.isSuperAdmin} size="sm" /> : null;

  const confirmCopy = confirm
    ? {
        disable: { title: t('confirm.disableTitle', { name: displayName(confirm.user) }), description: t('confirm.disableDescription'), label: t('actions.disable') },
        enable: { title: t('confirm.enableTitle', { name: displayName(confirm.user) }), description: t('confirm.enableDescription'), label: t('actions.enable') },
        unlink: { title: t('confirm.unlinkTitle'), description: t('confirm.unlinkDescription', { name: displayName(confirm.user) }), label: t('actions.unlinkEmployee') },
      }[confirm.kind]
    : null;

  return (
    <>
      <DataTable
        tableId="settings-users"
        columns={columns}
        data={rows}
        total={total}
        getRowId={(r) => r.id}
        onRowClick={(r) => setDetails(r)}
        filters={filters}
        searchPlaceholder={t('searchPlaceholder')}
        exportDataset={abilities.canExport ? 'users' : undefined}
        defaultSort={{ id: 'name', desc: false }}
        maxHeight="none"
        emptyState={{
          icon: UsersIcon,
          title: t('empty.title'),
          description: t('empty.description'),
          action: inviteButton,
        }}
        renderMobileCard={(u) => (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <EmployeeAvatar name={displayName(u)} seed={u.id} size="md" />
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium text-foreground">{displayName(u)}</div>
                <bdi dir="ltr" className="block truncate text-xs text-muted-foreground">
                  {u.email}
                </bdi>
                <RoleBadges roles={u.roles} label={roleLabel} max={2} className="mt-1.5" />
              </div>
            </div>
            <UserStatus user={u} />
          </div>
        )}
      />

      <UserDetailsSheet
        user={details}
        roles={roles}
        abilities={abilities}
        onOpenChange={(o) => !o && setDetails(null)}
        onAction={(kind, u) => {
          setDetails(null);
          open(kind, u);
        }}
      />
      <EditRolesDialog user={rolesUser} roles={roles} isSuperAdmin={abilities.isSuperAdmin} onOpenChange={(o) => !o && setRolesUser(null)} />
      <LinkEmployeeDialog user={linkUser} onOpenChange={(o) => !o && setLinkUser(null)} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        variant={confirm?.kind === 'enable' ? 'default' : 'danger'}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description}
        confirmLabel={confirmCopy?.label}
        onConfirm={async () => {
          if (!confirm) return;
          const { kind, user } = confirm;
          const result =
            kind === 'unlink'
              ? await run(unlinkEmployeeAction({ userId: user.id }))
              : await run(setUserStatusAction({ userId: user.id, status: kind === 'disable' ? 'disabled' : 'active' }));
          return result.ok;
        }}
      />
    </>
  );
}
