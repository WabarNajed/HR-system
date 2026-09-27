'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ImportOptions, ImportType } from '../../lib/types';

const STATUSES = ['active', 'probation', 'on_leave', 'suspended', 'resigned', 'terminated'] as const;

export type OptionCaps = { canUpdate: boolean; settingsEdit: boolean; leaveEdit: boolean };

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2 border-t border-border py-3.5 first:border-t-0 first:pt-0', className)}>{children}</div>;
}

export function ImportOptionsPanel({
  type,
  options,
  caps,
  hasLeaveColumn,
  disabled,
  onChange,
}: {
  type: ImportType;
  options: ImportOptions;
  caps: OptionCaps;
  hasLeaveColumn: boolean;
  disabled?: boolean;
  onChange: (next: ImportOptions) => void;
}) {
  const t = useTranslations('dataManagement.wizard.options');
  const ts = useTranslations('statuses.employment');
  const id = useId();
  const set = <K extends keyof ImportOptions>(key: K, value: ImportOptions[K]) => onChange({ ...options, [key]: value });
  const employees = type === 'employees';

  return (
    <div className="flex flex-col">
      <Row>
        <div className="text-sm font-medium text-foreground">{t('existing')}</div>
        <p className="text-xs text-muted-foreground">{t('existingHint')}</p>
        <RadioGroup value={options.existing} onValueChange={(v) => set('existing', v as ImportOptions['existing'])} className="grid-cols-2 gap-2" disabled={disabled}>
          {(['skip', 'update'] as const).map((v) => {
            const locked = v === 'update' && !caps.canUpdate;
            const item = (
              <Label
                key={v}
                htmlFor={`${id}-existing-${v}`}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft/40',
                  locked && 'cursor-not-allowed opacity-60',
                )}
              >
                <RadioGroupItem id={`${id}-existing-${v}`} value={v} disabled={locked || disabled} />
                {v === 'skip' ? t('existingSkip') : t('existingUpdate')}
              </Label>
            );
            return locked ? (
              <SimpleTooltip key={v} content={t('existingUpdateDenied')}>
                <span tabIndex={0}>{item}</span>
              </SimpleTooltip>
            ) : (
              item
            );
          })}
        </RadioGroup>
      </Row>

      {employees ? (
        <>
          <Row>
            <div className="flex items-start justify-between gap-3">
              <Label htmlFor={`${id}-create`} className="flex flex-col items-start gap-0.5 font-normal">
                <span className="text-sm font-medium text-foreground">{t('createMissing')}</span>
                <span className="text-xs text-muted-foreground">{caps.settingsEdit ? t('createMissingHint') : t('createMissingDenied')}</span>
              </Label>
              <Switch
                id={`${id}-create`}
                checked={options.createMissingMasterData && caps.settingsEdit}
                onCheckedChange={(v) => set('createMissingMasterData', v)}
                disabled={!caps.settingsEdit || disabled}
              />
            </div>
          </Row>
          <Row>
            <div className="flex items-start justify-between gap-3">
              <Label htmlFor={`${id}-profession`} className="flex flex-col items-start gap-0.5 font-normal">
                <span className="text-sm font-medium text-foreground">{t('professionAsJobTitle')}</span>
                <span className="text-xs text-muted-foreground">{t('professionAsJobTitleHint')}</span>
              </Label>
              <Switch id={`${id}-profession`} checked={options.professionAsJobTitle} onCheckedChange={(v) => set('professionAsJobTitle', v)} disabled={disabled} />
            </div>
          </Row>
          <Row>
            <Label htmlFor={`${id}-status`} className="text-sm font-medium text-foreground">
              {t('defaultStatus')}
            </Label>
            <Select value={options.defaultEmploymentStatus} onValueChange={(v) => set('defaultEmploymentStatus', v as ImportOptions['defaultEmploymentStatus'])} disabled={disabled}>
              <SelectTrigger id={`${id}-status`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ts(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('defaultStatusHint')}</p>
          </Row>
        </>
      ) : null}

      {(employees && hasLeaveColumn) || type === 'leave_balances' ? (
        <Row>
          {employees ? (
            <>
              <div className="text-sm font-medium text-foreground">{t('leaveMode')}</div>
              <RadioGroup value={options.leaveBalanceMode} onValueChange={(v) => set('leaveBalanceMode', v as ImportOptions['leaveBalanceMode'])} disabled={disabled || !caps.leaveEdit}>
                {(['available', 'carryover'] as const).map((v) => (
                  <Label
                    key={v}
                    htmlFor={`${id}-leave-${v}`}
                    className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 font-normal has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft/40"
                  >
                    <RadioGroupItem id={`${id}-leave-${v}`} value={v} className="mt-0.5" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm text-foreground">{v === 'available' ? t('leaveModeAvailable') : t('leaveModeCarryover')}</span>
                      <span className="text-xs text-muted-foreground">{v === 'available' ? t('leaveModeAvailableHint') : t('leaveModeCarryoverHint')}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-year`} className="text-sm font-medium text-foreground">
              {t('leaveYear')}
            </Label>
            <Input
              id={`${id}-year`}
              type="number"
              inputMode="numeric"
              min={2000}
              max={2200}
              value={options.leaveYear}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 2000 && n <= 2200) set('leaveYear', n);
              }}
              className="h-8 w-24 text-center numeric"
              disabled={disabled}
            />
          </div>
        </Row>
      ) : null}
    </div>
  );
}
