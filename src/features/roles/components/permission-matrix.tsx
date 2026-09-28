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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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

type ChipProps = {
  checked: boolean | 'indeterminate';
  changed?: boolean;
  disabled?: boolean;
  label: string;
  ariaLabel: string;
  onToggle: (on: boolean) => void;
};

/** Mobile toggle chip: the whole ≥44px chip is the tap target (label → checkbox). */
function PermissionChip({ checked, changed, disabled, label, ariaLabel, onToggle }: ChipProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors',
        checked === true ? 'border-primary/40 bg-primary-soft text-primary-soft-foreground' : 'border-border bg-card text-foreground',
        changed && 'ring-2 ring-warning/60',
        disabled ? 'opacity-80' : 'cursor-pointer active:bg-subtle',
      )}
    >
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onToggle(v === true)} aria-label={ariaLabel} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

/**
 * 13 modules × 6 actions with row / column toggles; changed cells are marked until saved.
 * md and up: the grid matrix. Below md: an accordion per module with full-size toggle chips, plus
 * "all modules" chips per action (no sideways scrolling, 44px tap targets).
 */
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
    <>
      <div className="md:hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('allModules')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ACTIONS.map((a) => {
              const perms = colPerms(a);
              const state = triState(countIn(perms), perms.length);
              return (
                <PermissionChip
                  key={a}
                  checked={state}
                  disabled={readOnly}
                  label={tAction(a)}
                  ariaLabel={t('toggleColumn', { action: tAction(a) })}
                  onToggle={() => setMany(perms, state !== true)}
                />
              );
            })}
          </div>
        </div>
        <Accordion type="multiple" className="px-4">
          {MODULES.map((m) => {
            const Icon = MODULE_ICONS[m];
            const perms = rowPerms(m);
            const granted = countIn(perms);
            const state = triState(granted, perms.length);
            const changedCount = perms.filter((p) => value.has(p) !== saved.has(p)).length;
            return (
              <AccordionItem key={m} value={m}>
                <AccordionTrigger className="items-center gap-3 py-3">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Icon className="size-4" strokeWidth={1.85} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{tModule(m)}</span>
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        {t('moduleSummary', { granted, total: perms.length })}
                        {changedCount ? (
                          <span className="ms-1.5 font-medium text-warning-soft-foreground">· {t('changedCount', { count: changedCount })}</span>
                        ) : null}
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="mb-3 text-xs leading-5 text-muted-foreground">{tHelp(m)}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ACTIONS.map((a) => {
                      const p = `${m}.${a}` as Permission;
                      const checked = value.has(p);
                      return (
                        <PermissionChip
                          key={a}
                          checked={checked}
                          changed={checked !== saved.has(p)}
                          disabled={readOnly}
                          label={tAction(a)}
                          ariaLabel={`${tModule(m)} · ${tAction(a)}`}
                          onToggle={(on) => setMany([p], on)}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    <PermissionChip
                      checked={state}
                      disabled={readOnly}
                      label={t('allActions')}
                      ariaLabel={t('toggleRow', { module: tModule(m) })}
                      onToggle={() => setMany(perms, state !== true)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[32rem] table-fixed border-separate border-spacing-0 text-sm sm:min-w-[36rem]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky start-0 z-10 w-[10rem] bg-subtle px-3 py-2.5 text-start text-xs font-semibold text-muted-foreground sm:w-auto sm:px-4"
              >
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
                  <th
                    scope="row"
                    className="sticky start-0 z-[1] border-t border-border bg-card px-3 py-2 text-start font-normal group-hover:bg-subtle sm:px-4"
                  >
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
                      <td
                        key={a}
                        className={cn(
                          'border-t border-border text-center group-hover:bg-subtle/60',
                          changed && 'bg-warning-soft/60 group-hover:bg-warning-soft',
                        )}
                      >
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
    </>
  );
}
