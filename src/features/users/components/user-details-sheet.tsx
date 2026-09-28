'use client';

import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { useDateFormat } from '@/lib/i18n/use-date-format';
import { cn } from '@/lib/utils';
import type { UserAbilities } from '../queries';
import type { RoleOption, UserRow } from '../types';
import { RoleBadges, useRoleLookup } from './role-badges';
import { useUserActions, UserStatus, type UserActionKind } from './user-actions';

type UserDetailsSheetProps = {
  user: UserRow | null;
  roles: RoleOption[];
  abilities: UserAbilities;
  onOpenChange: (open: boolean) => void;
  onAction: (kind: UserActionKind, user: UserRow) => void;
};

/** Quick view of a portal account with its management actions. */
export function UserDetailsSheet({ user: current, roles, abilities, onOpenChange, onAction }: UserDetailsSheetProps) {
  const t = useTranslations('users');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const fmt = useDateFormat();
  const roleLabel = useRoleLookup(roles);
  // Keep the last user while the sheet animates out.
  const [user, setUser] = useState(current);
  if (current && current !== user) setUser(current);
  const actionsFor = useUserActions(abilities);
  const name = user ? user.fullName?.trim() || user.email || '—' : '';
  const actions = user ? actionsFor(user, onAction).filter((a) => !a.hidden && a.label !== t('actions.viewDetails')) : [];

  return (
    <Sheet open={Boolean(current)} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full sm:max-w-md">
        {user ? (
          <>
            <SheetHeader className="flex-row items-center gap-3">
              <EmployeeAvatar name={name} seed={user.id} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate">{name}</SheetTitle>
                <SheetDescription asChild>
                  <bdi dir="ltr" className="block truncate rtl:text-end">
                    {user.email}
                  </bdi>
                </SheetDescription>
                <div className="mt-1.5">
                  <UserStatus user={user} />
                </div>
              </div>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-5">
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-faint-foreground uppercase">{t('columns.roles')}</h3>
                <RoleBadges roles={user.roles} label={roleLabel} max={10} emptyLabel={t('noRoles')} />
              </section>
              <section>
                <h3 className="mb-2 text-xs font-semibold tracking-wide text-faint-foreground uppercase">{t('columns.employee')}</h3>
                {user.employee ? (
                  <Link
                    href={`/employees/${user.employee.id}`}
                    className="group flex items-center gap-3 rounded-lg border border-border bg-subtle px-3 py-2.5 transition-colors hover:border-border-strong"
                  >
                    <EmployeeAvatar name={employeeDisplayName(user.employee, locale)} seed={user.employee.id} size="sm" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                        {employeeDisplayName(user.employee, locale)}
                      </span>
                      {user.employee.employee_number ? (
                        <bdi className="text-xs text-muted-foreground numeric">{user.employee.employee_number}</bdi>
                      ) : null}
                    </span>
                    <ExternalLinkIcon className="size-4 text-faint-foreground rtl:-scale-x-100" aria-hidden />
                  </Link>
                ) : (
                  <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-meta text-muted-foreground">{t('notLinkedHint')}</p>
                )}
              </section>
              <KeyValueGrid
                columns={2}
                items={[
                  { label: tc('mobile'), value: user.mobile, ltr: true },
                  { label: t('columns.lastLogin'), value: user.lastLoginAt ? fmt.dateTime(user.lastLoginAt) : t('never') },
                  { label: t('columns.created'), value: fmt.dateTime(user.createdAt) },
                  { label: t('invitedAt'), value: user.invitedAt ? fmt.dateTime(user.invitedAt) : null, hidden: !user.invitedAt },
                ]}
              />
            </SheetBody>
            {actions.length ? (
              <SheetFooter className="flex-wrap justify-start gap-2">
                {actions.map((a) => {
                  const Icon = a.icon;
                  const className = cn(a.variant === 'destructive' && 'text-danger hover:bg-danger-soft hover:text-danger');
                  return a.href ? (
                    <Button key={a.label} asChild size="sm" variant="outline" className={className}>
                      <Link href={a.href}>
                        {Icon ? <Icon /> : null}
                        {a.label}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      key={a.label}
                      size="sm"
                      variant="outline"
                      className={className}
                      disabled={a.disabled}
                      title={a.disabled ? a.disabledReason : undefined}
                      onClick={() => a.onSelect?.(user)}
                    >
                      {Icon ? <Icon /> : null}
                      {a.label}
                    </Button>
                  );
                })}
              </SheetFooter>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
