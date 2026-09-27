'use client';

import { ClockIcon, UserPlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useActionFeedback } from '@/features/users/components/use-action-feedback';
import { saveSecuritySettingsAction } from '../security-actions';
import { SESSION_TIMEOUTS } from '../security-options';

type Props = { allowSelfRegistration: boolean; sessionTimeoutMinutes: number; canEdit: boolean };

export function SecuritySettingsForm({ allowSelfRegistration, sessionTimeoutMinutes, canEdit }: Props) {
  const t = useTranslations('security.access');
  const tc = useTranslations('common');
  const run = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [allow, setAllow] = useState(allowSelfRegistration);
  const [timeout, setTimeoutValue] = useState(sessionTimeoutMinutes);
  const dirty = allow !== allowSelfRegistration || timeout !== sessionTimeoutMinutes;
  const options: number[] = SESSION_TIMEOUTS.includes(sessionTimeoutMinutes as (typeof SESSION_TIMEOUTS)[number])
    ? [...SESSION_TIMEOUTS]
    : [...SESSION_TIMEOUTS, sessionTimeoutMinutes].sort((a, b) => a - b);

  const label = (m: number) => (m < 60 ? t('minutes', { count: m }) : m < 1440 ? t('hours', { count: m / 60 }) : t('days', { count: m / 1440 }));

  const save = () =>
    startTransition(async () => {
      await run(saveSecuritySettingsAction({ allowSelfRegistration: allow, sessionTimeoutMinutes: timeout }));
    });

  return (
    <SectionCard
      title={t('title')}
      description={t('description')}
      footer={
        canEdit ? (
          <div className="flex w-full items-center justify-end gap-2">
            {dirty ? <span className="me-auto text-meta text-warning">{tc('unsavedChanges')}</span> : null}
            <Button
              variant="outline"
              size="sm"
              disabled={!dirty || pending}
              onClick={() => {
                setAllow(allowSelfRegistration);
                setTimeoutValue(sessionTimeoutMinutes);
              }}
            >
              {tc('cancel')}
            </Button>
            <Button size="sm" onClick={save} loading={pending} disabled={!dirty} className="min-w-24">
              {pending ? tc('saving') : tc('saveChanges')}
            </Button>
          </div>
        ) : (
          <span className="text-meta text-muted-foreground">{t('readOnly')}</span>
        )
      }
    >
      <div className="flex flex-col divide-y divide-border">
        <div className="flex items-start gap-4 pb-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UserPlusIcon className="size-[1.125rem]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor="allow-registration" className="block text-sm font-medium text-foreground">
              {t('selfRegistration')}
            </label>
            <p className="mt-0.5 text-meta text-muted-foreground">{allow ? t('selfRegistrationOn') : t('selfRegistrationOff')}</p>
          </div>
          <Switch id="allow-registration" checked={allow} onCheckedChange={setAllow} disabled={!canEdit || pending} />
        </div>
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ClockIcon className="size-[1.125rem]" aria-hidden />
            </span>
            <div className="min-w-0">
              <label htmlFor="session-timeout" className="block text-sm font-medium text-foreground">
                {t('sessionTimeout')}
              </label>
              <p className="mt-0.5 text-meta text-muted-foreground">{t('sessionTimeoutHint')}</p>
            </div>
          </div>
          <Select value={String(timeout)} onValueChange={(v) => setTimeoutValue(Number(v))} disabled={!canEdit || pending}>
            <SelectTrigger id="session-timeout" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {label(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </SectionCard>
  );
}
