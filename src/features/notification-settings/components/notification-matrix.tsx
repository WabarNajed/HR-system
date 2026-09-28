'use client';

import { BellIcon, BellOffIcon, FileWarningIcon, InfoIcon, MailIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SectionCard } from '@/components/shared/section-card';
import { StickyFormFooter } from '@/components/shared/sticky-form-footer';
import { Badge } from '@/components/ui/badge';
import { useErrorMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useUnsavedChangesWarning } from '@/features/request-config/components/use-unsaved';
import type { Locale } from '@/lib/i18n/config';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { saveNotificationSettings } from '../actions';
import { EVENT_GROUPS, templateKeysFor } from '../constants';
import type { NotificationSettingRow, TemplateLite } from '../queries';

type State = Record<string, { inApp: boolean; email: boolean }>;

type Props = { rows: NotificationSettingRow[]; templates: TemplateLite[]; canEdit: boolean };

function toState(rows: NotificationSettingRow[]): State {
  return Object.fromEntries(rows.map((r) => [r.event_key, { inApp: r.in_app_enabled, email: r.email_enabled }]));
}

/** Notification events × channels (in-app, email) with recipients and email template status. */
export function NotificationMatrix({ rows, templates, canEdit }: Props) {
  const t = useTranslations('emailTemplates.notifications');
  const tRoot = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const resolve = useErrorMessage();
  const baseline = useMemo(() => toState(rows), [rows]);
  const [state, setState] = useState<State>(baseline);
  const [pending, startTransition] = useTransition();
  const templateMap = useMemo(() => new Map(templates.map((x) => [x.key, x])), [templates]);
  const byKey = useMemo(() => new Map(rows.map((r) => [r.event_key, r])), [rows]);

  const changed = Object.keys(state).filter((k) => state[k]!.inApp !== baseline[k]?.inApp || state[k]!.email !== baseline[k]?.email);
  const dirty = changed.length > 0;
  useUnsavedChangesWarning(dirty);

  const known = new Set<string>(EVENT_GROUPS.flatMap((g) => g.events as readonly string[]));
  const groups = [
    ...EVENT_GROUPS.map((g) => ({ key: g.key as string, events: (g.events as readonly string[]).filter((e) => byKey.has(e)) })),
    { key: 'other', events: rows.map((r) => r.event_key).filter((k) => !known.has(k)) },
  ].reduce<{ key: string; events: string[] }[]>((acc, g) => {
    const existing = acc.find((a) => a.key === g.key);
    if (existing) existing.events.push(...g.events);
    else acc.push({ key: g.key, events: [...g.events] });
    return acc;
  }, []);

  const set = (key: string, patch: Partial<{ inApp: boolean; email: boolean }>) => setState((s) => ({ ...s, [key]: { ...s[key]!, ...patch } }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    startTransition(async () => {
      const result = await saveNotificationSettings({ rows: changed.map((k) => ({ eventKey: k, inApp: state[k]!.inApp, email: state[k]!.email })) });
      if (!result.ok) {
        toast.error(resolve(result.error));
        return;
      }
      toast.success(resolve(result.message));
      router.refresh();
    });
  };

  const eventName = (key: string) => (tRoot.has(`emailTemplates.events.${key}.name` as 'emailTemplates.events.request_submitted.name') ? tRoot(`emailTemplates.events.${key}.name` as 'emailTemplates.events.request_submitted.name') : key);
  const eventDescription = (key: string) =>
    tRoot.has(`emailTemplates.events.${key}.description` as 'emailTemplates.events.request_submitted.description')
      ? tRoot(`emailTemplates.events.${key}.description` as 'emailTemplates.events.request_submitted.description')
      : null;
  const recipientLabel = (key: string) => (tRoot.has(`emailTemplates.recipients.${key}` as 'emailTemplates.recipients.hr') ? tRoot(`emailTemplates.recipients.${key}` as 'emailTemplates.recipients.hr') : key);

  const inAppCount = Object.values(state).filter((s) => s.inApp).length;
  const emailCount = Object.values(state).filter((s) => s.email).length;

  return (
    <form id="notification-settings-form" onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-meta text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <BellIcon className="size-4 text-primary" aria-hidden />
          {t('summaryInApp', { count: inAppCount, total: rows.length })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MailIcon className="size-4 text-primary" aria-hidden />
          {t('summaryEmail', { count: emailCount, total: rows.length })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <InfoIcon className="size-4" aria-hidden />
          {t('rule')}
        </span>
      </div>

      {groups
        .filter((g) => g.events.length)
        .map((g) => (
          <SectionCard key={g.key} flush dense title={t(`groups.${g.key as 'requests'}`)} bodyClassName="p-0">
            <div role="table" aria-label={t(`groups.${g.key as 'requests'}`)} className="divide-y divide-border">
              <div role="row" className="hidden grid-cols-[minmax(0,1fr)_13rem_6rem_12rem] items-center gap-4 bg-subtle/70 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span role="columnheader">{t('columns.event')}</span>
                <span role="columnheader">{t('columns.recipients')}</span>
                <span role="columnheader" className="text-center">
                  {tRoot('enums.notificationChannel.in_app')}
                </span>
                <span role="columnheader">{tRoot('enums.notificationChannel.email')}</span>
              </div>
              {g.events.map((key) => {
                const row = byKey.get(key)!;
                const s = state[key]!;
                const tplKeys = templateKeysFor(key);
                const tpls = tplKeys.map((k) => templateMap.get(k)).filter((x): x is TemplateLite => Boolean(x));
                const hasTemplate = tpls.length > 0;
                const inactiveTpl = tpls.some((x) => !x.is_active);
                const suppressed = !s.inApp && !s.email;
                const emailBlocked = !hasTemplate && !s.email;
                const changedRow = changed.includes(key);
                return (
                  <div
                    role="row"
                    key={key}
                    className={cn(
                      'grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_13rem_6rem_12rem] md:items-center md:gap-4',
                      changedRow && 'bg-secondary-soft/40',
                    )}
                  >
                    <div role="cell" className="min-w-0 leading-tight">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        {eventName(key)}
                        {suppressed ? (
                          <Badge variant="neutral" size="sm">
                            <BellOffIcon className="size-3" aria-hidden />
                            {t('suppressed')}
                          </Badge>
                        ) : null}
                      </p>
                      {eventDescription(key) ? <p className="mt-1 text-xs text-muted-foreground">{eventDescription(key)}</p> : null}
                    </div>
                    <div role="cell" className="flex flex-wrap items-center gap-1">
                      <UsersIcon className="size-3.5 text-faint-foreground md:hidden" aria-hidden />
                      {row.recipients.length ? (
                        row.recipients.map((r) => (
                          <span key={r} className="rounded-md border border-border bg-subtle px-1.5 py-0.5 text-xs text-foreground">
                            {recipientLabel(r)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-faint-foreground">—</span>
                      )}
                    </div>
                    <div role="cell" className="flex items-center gap-2 md:justify-center">
                      <Switch
                        checked={s.inApp}
                        disabled={!canEdit || pending}
                        onCheckedChange={(v) => set(key, { inApp: v })}
                        aria-label={`${eventName(key)} · ${tRoot('enums.notificationChannel.in_app')}`}
                      />
                      <span className="text-xs text-muted-foreground md:hidden">{tRoot('enums.notificationChannel.in_app')}</span>
                    </div>
                    <div role="cell" className="flex min-w-0 items-center gap-2.5">
                      <SimpleTooltip content={emailBlocked ? t('noTemplate') : undefined}>
                        <span tabIndex={emailBlocked ? 0 : -1} className="inline-flex">
                          <Switch
                            checked={s.email}
                            disabled={!canEdit || pending || emailBlocked}
                            onCheckedChange={(v) => set(key, { email: v })}
                            aria-label={`${eventName(key)} · ${tRoot('enums.notificationChannel.email')}`}
                          />
                        </span>
                      </SimpleTooltip>
                      <span className="min-w-0 text-xs leading-tight">
                        <span className="text-muted-foreground md:hidden">{tRoot('enums.notificationChannel.email')} · </span>
                        {hasTemplate ? (
                          tpls.length === 1 ? (
                            <Link href={`/settings/email-templates/${tpls[0]!.key}`} className="text-primary hover:underline">
                              {localized(tpls[0]!, 'name', locale)}
                            </Link>
                          ) : (
                            <Link href="/settings/email-templates?group=expiry" className="text-primary hover:underline">
                              {t('templatesCount', { count: tpls.length })}
                            </Link>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-faint-foreground">
                            <FileWarningIcon className="size-3" aria-hidden />
                            {t('noTemplateShort')}
                          </span>
                        )}
                        {hasTemplate && inactiveTpl && s.email ? <span className="mt-0.5 block text-warning">{t('templateInactive')}</span> : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ))}

      {canEdit ? (
        <StickyFormFooter
          dirty={dirty}
          pending={pending}
          formId="notification-settings-form"
          submitDisabled={!dirty}
          onCancel={dirty ? () => setState(baseline) : undefined}
          cancelLabel={tRoot('common.discard')}
          start={!dirty ? <span>{t('savedState')}</span> : <span className="numeric">{t('changedCount', { count: changed.length })}</span>}
        />
      ) : null}
    </form>
  );
}
