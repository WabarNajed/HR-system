'use client';

import {
  BanknoteIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  CheckCheckIcon,
  FileBadgeIcon,
  FolderOpenIcon,
  HeartPulseIcon,
  InboxIcon,
  ScrollTextIcon,
  SettingsIcon,
  UserCogIcon,
  UsersIcon,
  UserSquareIcon,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { ACTIONS, MODULES, type Action, type Module, type Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export const MODULE_ICONS: Record<Module, LucideIcon> = {
  employees: UsersIcon,
  personal_data: UserSquareIcon,
  bank: BanknoteIcon,
  insurance: HeartPulseIcon,
  documents: FolderOpenIcon,
  requests: InboxIcon,
  approvals: CheckCheckIcon,
  leave: CalendarDaysIcon,
  certificates: FileBadgeIcon,
  reports: BarChart3Icon,
  settings: SettingsIcon,
  audit: ScrollTextIcon,
  users: UserCogIcon,
};

type PermissionMatrixProps = {
  value: ReadonlySet<Permission>;
  /** Baseline (saved) permissions — changed cells are highlighted. */
  saved: ReadonlySet<Permission>;
  onChange: (next: Set<Permission>) => void;
  readOnly?: boolean;
};

function triState(count: number, total: number): boolean | 'indeterminate' {
  if (count === 0) return false;
  if (count === total) return true;
  return 'indeterminate';
}

/** 13 modules × 6 actions with row / column toggles; changed cells are marked until saved. */
export function PermissionMatrix({ value, saved, onChange, readOnly }: PermissionMatrixProps) {
  const t = useTranslations('roles.matrix');
  const tModule = useTranslations('enums.permissionModule');
  const tAction = useTranslations('enums.permissionAction');
  const tHelp = useTranslations('roles.modules');

  const setMany = (perms: Permission[], on: boolean) => {
    const next = new Set(value);
    for (const p of perms) {
      if (on) next.add(p);
      else next.delete(p);
    }
    onChange(next);
  };

  const rowPerms = (m: Module) => ACTIONS.map((a) => `${m}.${a}` as Permission);
  const colPerms = (a: Action) => MODULES.map((m) => `${m}.${a}` as Permission);
  const countIn = (perms: Permission[]) => perms.filter((p) => value.has(p)).length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] table-fixed border-separate border-spacing-0 text-sm sm:min-w-[36rem]">
        <thead>
          <tr>
            <th scope="col" className="sticky start-0 z-10 w-[10rem] bg-subtle px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground sm:w-auto sm:px-4">
              {t('module')}
            </th>
            {ACTIONS.map((a) => {
              const perms = colPerms(a);
              const state = triState(countIn(perms), perms.length);
              return (
                <th key={a} scope="col" className="w-[3.75rem] bg-subtle px-0.5 py-2 text-center">
                  <label className={cn('inline-flex flex-col items-center gap-1.5', !readOnly && 'cursor-pointer')}>
                    <span className="max-w-full truncate text-[0.6875rem] font-semibold text-muted-foreground">{tAction(a)}</span>
                    <Checkbox
                      checked={state}
                      disabled={readOnly}
                      onCheckedChange={() => setMany(perms, state !== true)}
                      aria-label={t('toggleColumn', { action: tAction(a) })}
                    />
                  </label>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m];
            const perms = rowPerms(m);
            const state = triState(countIn(perms), perms.length);
            return (
              <tr key={m} className="group">
                <th scope="row" className="sticky start-0 z-[1] border-t border-border bg-card px-3 py-2 text-start font-normal group-hover:bg-subtle sm:px-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Checkbox
                      checked={state}
                      disabled={readOnly}
                      onCheckedChange={() => setMany(perms, state !== true)}
                      aria-label={t('toggleRow', { module: tModule(m) })}
                    />
                    <span className="hidden size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground sm:flex">
                      <Icon className="size-3.5" strokeWidth={1.85} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1" title={tHelp(m)}>
                      <span className="block truncate text-sm font-medium text-foreground">{tModule(m)}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">{tHelp(m)}</span>
                    </span>
                  </div>
                </th>
                {ACTIONS.map((a) => {
                  const p = `${m}.${a}` as Permission;
                  const checked = value.has(p);
                  const changed = checked !== saved.has(p);
                  return (
                    <td key={a} className={cn('border-t border-border text-center group-hover:bg-subtle/60', changed && 'bg-warning-soft/60 group-hover:bg-warning-soft')}>
                      <Checkbox
                        checked={checked}
                        disabled={readOnly}
                        onCheckedChange={(v) => setMany([p], v === true)}
                        aria-label={`${tModule(m)} · ${tAction(a)}`}
                        className="mx-auto"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
