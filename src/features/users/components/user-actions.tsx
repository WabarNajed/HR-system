'use client';

import {
  ClipboardCheckIcon,
  EyeIcon,
  KeyRoundIcon,
  Link2Icon,
  Link2OffIcon,
  MailPlusIcon,
  PowerIcon,
  PowerOffIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { RowAction } from '@/components/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import type { UserAbilities } from '../queries';
import type { UserRow } from '../types';
import type { DialogUser } from './user-dialogs';

export type UserActionKind = 'details' | 'roles' | 'link' | 'unlink' | 'disable' | 'enable' | 'resend' | 'reset';

export function displayName(u: Pick<UserRow, 'fullName' | 'email'>): string {
  return u.fullName?.trim() || u.email || '—';
}

export function toDialogUser(u: UserRow): DialogUser {
  return { id: u.id, name: displayName(u), email: u.email, roles: u.roles, isSelf: u.isSelf };
}

/** Row/sheet actions for a user, with the reason when an action is unavailable. */
export function useUserActions(abilities: UserAbilities) {
  const t = useTranslations('users.actions');
  const tr = useTranslations('users.reasons');
  return useCallback((u: UserRow, open: (kind: UserActionKind, user: UserRow) => void): RowAction<UserRow>[] => {
    const targetSuper = u.roles.includes('super_admin');
    const protectedSuper = targetSuper && !abilities.isSuperAdmin;
    const registration = u.status === 'pending' || u.status === 'info_requested' || u.status === 'rejected';
    const items: RowAction<UserRow>[] = [{ label: t('viewDetails'), icon: EyeIcon, onSelect: () => open('details', u) }];
    if (registration) {
      items.push({
        label: t('reviewRegistration'),
        icon: ClipboardCheckIcon,
        href: `/settings/pending-registrations?tab=${u.status}&review=${u.id}`,
        hidden: !abilities.canApprove,
      });
      return items;
    }
    items.push({
      label: t('editRoles'),
      icon: ShieldCheckIcon,
      onSelect: () => open('roles', u),
      hidden: !abilities.canAdminister,
      disabled: protectedSuper,
      disabledReason: tr('superAdminOnly'),
    });
    if (abilities.canEdit) {
      items.push(
        u.employee
          ? { label: t('unlinkEmployee'), icon: Link2OffIcon, onSelect: () => open('unlink', u), disabled: protectedSuper, disabledReason: tr('superAdminOnly') }
          : { label: t('linkEmployee'), icon: Link2Icon, onSelect: () => open('link', u), disabled: protectedSuper, disabledReason: tr('superAdminOnly') },
      );
      if (u.status === 'active') {
        items.push(
          u.invitationPending
            ? { label: t('resendInvitation'), icon: MailPlusIcon, onSelect: () => open('resend', u), separatorBefore: true }
            : { label: t('sendPasswordReset'), icon: KeyRoundIcon, onSelect: () => open('reset', u), separatorBefore: true },
        );
      }
      items.push(
        u.status === 'disabled'
          ? {
              label: t('enable'),
              icon: PowerIcon,
              onSelect: () => open('enable', u),
              separatorBefore: true,
              disabled: protectedSuper,
              disabledReason: tr('superAdminOnly'),
            }
          : {
              label: t('disable'),
              icon: PowerOffIcon,
              variant: 'destructive',
              onSelect: () => open('disable', u),
              separatorBefore: true,
              disabled: u.isSelf || protectedSuper,
              disabledReason: u.isSelf ? tr('self') : tr('superAdminOnly'),
            },
      );
    }
    return items;
  }, [abilities, t, tr]);
}

/** Status badge plus the "invitation pending" marker. */
export function UserStatus({ user }: { user: Pick<UserRow, 'status' | 'invitationPending'> }) {
  const t = useTranslations('users');
  if (user.invitationPending) {
    return (
      <Badge variant="info" size="md" dot>
        {t('status.invited')}
      </Badge>
    );
  }
  return <StatusBadge domain="profile" status={user.status} />;
}
