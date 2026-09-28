'use client';

import { CircleDotIcon, CrownIcon, LockIcon, PencilIcon, ShieldCheckIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useActionFeedback } from '@/features/users/components/use-action-feedback';
import { localized } from '@/lib/i18n/localized';
import { ALL_PERMISSIONS, type Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { deleteRoleAction, saveRolePermissionsAction } from '../actions';
import type { RoleWithPermissions } from '../queries';
import { PermissionMatrix } from './permission-matrix';
import { RoleDialog } from './role-dialog';

type Member = { id: string; fullName: string | null; email: string | null; status: string };

type RolesConsoleProps = {
  roles: RoleWithPermissions[];
  selectedKey: string;
  members: Member[];
  canAdminister: boolean;
  isSuperAdmin: boolean;
};

export function RolesConsole({ roles, selectedKey, members, canAdminister, isSuperAdmin }: RolesConsoleProps) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const locale = useLocale() as 'ar' | 'en';
  const router = useRouter();
  const pathname = usePathname();
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();

  const role = roles.find((r) => r.key === selectedKey) ?? roles[0]!;
  const locked = role.key === 'super_admin';
  const readOnly = locked || !canAdminister;
  const saved = useMemo(() => new Set<Permission>(locked ? ALL_PERMISSIONS : role.permissions), [role, locked]);
  const [draft, setDraft] = useState<Set<Permission>>(saved);
  const [dialog, setDialog] = useState<'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);

  // Saved permissions changed (after a save / refresh) → start from the new baseline.
  const [prevSaved, setPrevSaved] = useState(saved);
  if (saved !== prevSaved) {
    setPrevSaved(saved);
    setDraft(new Set(saved));
  }

  const changes = useMemo(() => {
    let n = 0;
    for (const p of ALL_PERMISSIONS) if (draft.has(p) !== saved.has(p)) n++;
    return n;
  }, [draft, saved]);
  const dirty = changes > 0;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const name = (r: RoleWithPermissions) => localized({ name_ar: r.nameAr, name_en: r.nameEn }, 'name', locale);
  const description = localized({ description_ar: role.descriptionAr, description_en: role.descriptionEn }, 'description', locale);

  const selectRole = (key: string) => {
    if (key === role.key) return;
    if (dirty) {
      setPendingNav(key);
      return;
    }
    router.push(`${pathname}?role=${key}`, { scroll: false });
  };

  const save = () =>
    startTransition(async () => {
      await run(saveRolePermissionsAction({ roleId: role.id, permissions: Array.from(draft) }));
    });

  const granted = locked ? ALL_PERMISSIONS.length : draft.size;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[14.5rem_minmax(0,1fr)]">
      {/* Roles list */}
      <div className="xl:hidden">
        <Select value={role.key} onValueChange={selectRole}>
          <SelectTrigger className="h-10 w-full bg-card" aria-label={t('list.title')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.key} value={r.key}>
                {name(r)} · {t('list.members', { count: r.memberCount })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SectionCard
        className="hidden xl:sticky xl:top-[calc(var(--spacing-header)+1.5rem)] xl:flex"
        title={t('list.title')}
        flush
        dense
      >
        <nav aria-label={t('list.title')} className="flex flex-col p-1.5">
          {roles.map((r) => {
            const active = r.key === role.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => selectRole(r.key)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  active ? 'bg-primary-soft' : 'hover:bg-accent',
                )}
              >
                {active ? <span aria-hidden className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-primary" /> : null}
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md',
                    r.key === 'super_admin' ? 'bg-secondary-soft text-secondary-soft-foreground' : active ? 'bg-card text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {r.key === 'super_admin' ? <CrownIcon className="size-4" /> : <ShieldCheckIcon className="size-4" strokeWidth={1.85} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('line-clamp-2 text-sm leading-5 font-medium', active ? 'text-primary-soft-foreground' : 'text-foreground')}>{name(r)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.isSystem ? t(`scope.${r.dataScope}`) : `${t('list.custom')} · ${t(`scope.${r.dataScope}`)}`}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground numeric" title={t('list.members', { count: r.memberCount })}>
                  <UsersIcon className="size-3.5" aria-hidden />
                  {r.memberCount}
                </span>
              </button>
            );
          })}
        </nav>
      </SectionCard>

      {/* Selected role */}
      <div className="flex min-w-0 flex-col gap-4">
        <SectionCard dense>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-current/10',
                  locked ? 'bg-secondary-soft text-secondary-soft-foreground' : 'bg-primary-soft text-primary',
                )}
              >
                {locked ? <CrownIcon className="size-5" /> : <ShieldCheckIcon className="size-5" strokeWidth={1.8} />}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-section-title text-foreground">{name(role)}</h2>
                  <Badge variant={role.isSystem ? 'neutral' : 'outline'} size="sm">
                    {role.isSystem ? t('list.system') : t('list.custom')}
                  </Badge>
                  <Badge variant={role.dataScope === 'organization' ? 'info' : 'secondary'} size="sm">
                    {t(`scope.${role.dataScope}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-meta text-muted-foreground">{description || t('noDescription')}</p>
                <p className="mt-1.5 text-xs text-faint-foreground">{t(`scopeHelp.${role.dataScope}`)}</p>
              </div>
            </div>
            {canAdminister && !(locked && !isSuperAdmin) ? (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
                  <PencilIcon />
                  {t('edit.open')}
                </Button>
                {!role.isSystem ? (
                  <SimpleTooltip content={role.memberCount ? t('delete.inUse', { count: role.memberCount }) : null}>
                    <span tabIndex={role.memberCount ? 0 : -1}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-danger hover:bg-danger-soft hover:text-danger"
                        disabled={role.memberCount > 0}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2Icon />
                        {tc('delete')}
                      </Button>
                    </span>
                  </SimpleTooltip>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title={t('matrix.title')}
          description={t('matrix.summary', { granted, total: ALL_PERMISSIONS.length })}
          flush
          actions={
            !readOnly ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setDraft(new Set(ALL_PERMISSIONS))}>
                  {t('matrix.grantAll')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft(new Set())}>
                  {t('matrix.clearAll')}
                </Button>
              </div>
            ) : null
          }
        >
          {locked || !canAdminister ? (
            <div className="border-b border-border px-5 py-3">
              <Alert variant={locked ? 'warning' : 'info'} className="py-2.5">
                <LockIcon />
                <AlertDescription>{locked ? t('matrix.superAdminLocked') : t('matrix.readOnly')}</AlertDescription>
              </Alert>
            </div>
          ) : null}
          <PermissionMatrix value={locked ? saved : draft} saved={saved} onChange={setDraft} readOnly={readOnly} />
        </SectionCard>

        <SectionCard
          title={t('members.title')}
          description={t('list.members', { count: role.memberCount })}
          dense
          actions={
            role.memberCount ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={`/settings/users?role=${role.key}`}>{t('members.viewAll')}</Link>
              </Button>
            ) : null
          }
        >
          {members.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => {
                const label = m.fullName?.trim() || m.email || '—';
                return (
                  <li key={m.id} className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2">
                    <EmployeeAvatar name={label} seed={m.id} size="sm" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span dir="auto" className="block w-fit max-w-full truncate text-sm font-medium text-foreground">{label}</span>
                      <bdi dir="ltr" className="block truncate text-xs text-muted-foreground rtl:text-end">
                        {m.email}
                      </bdi>
                    </span>
                    {m.status !== 'active' ? <StatusBadge domain="profile" status={m.status} size="sm" /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-2 text-meta text-muted-foreground">{t('members.empty')}</p>
          )}
        </SectionCard>

        {/* Dirty-state save bar */}
        <div
          aria-hidden={!dirty}
          className={cn(
            'sticky bottom-4 z-20 transition-all duration-200',
            dirty ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
          )}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/95 px-4 py-2.5 shadow-raised backdrop-blur-md">
            <span className="flex min-w-40 flex-1 items-center gap-2 text-meta font-medium text-warning">
              <CircleDotIcon className="size-4 shrink-0" aria-hidden />
              {t('matrix.unsaved', { count: changes })}
            </span>
            <div className="ms-auto flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setDraft(new Set(saved))} disabled={pending} tabIndex={dirty ? 0 : -1}>
                {tc('discardChanges')}
              </Button>
              <Button size="sm" onClick={save} loading={pending} tabIndex={dirty ? 0 : -1} className="min-w-28">
                {pending ? tc('saving') : tc('saveChanges')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {canAdminister ? (
        <RoleDialog
          mode={dialog}
          role={role}
          roles={roles}
          isSuperAdmin={isSuperAdmin}
          onOpenChange={(o) => !o && setDialog(null)}
          onCreated={(key) => router.push(`${pathname}?role=${key}`, { scroll: false })}
        />
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="danger"
        title={t('delete.title', { name: name(role) })}
        description={t('delete.description')}
        confirmLabel={tc('delete')}
        onConfirm={async () => {
          const result = await run(deleteRoleAction({ roleId: role.id }), { refresh: false });
          if (result.ok) router.replace(pathname, { scroll: false });
          return result.ok;
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingNav)}
        onOpenChange={(o) => !o && setPendingNav(null)}
        title={tc('unsavedChanges')}
        description={tc('unsavedChangesDescription')}
        confirmLabel={tc('discard')}
        variant="danger"
        onConfirm={() => {
          const key = pendingNav;
          setDraft(new Set(saved));
          setPendingNav(null);
          if (key) router.push(`${pathname}?role=${key}`, { scroll: false });
        }}
      />
    </div>
  );
}
