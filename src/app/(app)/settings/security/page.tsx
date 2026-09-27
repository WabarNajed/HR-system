import { CheckIcon, CrownIcon, HistoryIcon, KeyRoundIcon, LogInIcon, LogOutIcon, MailIcon, TriangleAlertIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmployeeAvatar } from '@/components/shared/employee-avatar';
import { PageHeader } from '@/components/shared/page-header';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { SecuritySettingsForm } from '@/features/auth/components/security-settings-form';
import { PASSWORD_POLICY } from '@/features/auth/security-options';
import { getEmailStatus, getRecentSignIns, getSecuritySettings, getSuperAdminOwners } from '@/features/auth/security-queries';
import { RelativeTime } from '@/features/users/components/relative-time';
import { requireAccess } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.security');

/** Very small UA summary for the activity list ("Chrome · Windows"); raw UA stays in the audit log. */
function describeAgent(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}

/** Settings › Security: registration & session policy, password policy, owners, sign-in activity, e-mail. */
export default async function SettingsSecurityPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/security']);
  const [t, settings, owners, signIns] = await Promise.all([
    getTranslations('security'),
    getSecuritySettings(),
    getSuperAdminOwners(ctx),
    getRecentSignIns(ctx),
  ]);
  const email = getEmailStatus();
  const activeOwners = owners?.filter((o) => o.status === 'active').length ?? 0;

  const main = (
    <>
      {settings ? (
        <SecuritySettingsForm
          allowSelfRegistration={settings.allowSelfRegistration}
          sessionTimeoutMinutes={settings.sessionTimeoutMinutes}
          canEdit={can(ctx, 'settings.edit')}
        />
      ) : null}

      <SectionCard
        title={t('activity.title')}
        description={t('activity.description')}
        icon={<HistoryIcon />}
        flush
        actions={
          signIns && can(ctx, 'audit.view') ? (
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/audit-logs">{t('activity.viewAll')}</Link>
            </Button>
          ) : null
        }
      >
        {signIns === null ? (
          <p className="px-5 py-4 text-meta text-muted-foreground">{t('activity.noPermission')}</p>
        ) : signIns.length === 0 ? (
          <p className="px-5 py-4 text-meta text-muted-foreground">{t('activity.empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {signIns.map((e) => {
              const login = e.action === 'auth.login';
              const agent = describeAgent(e.userAgent);
              return (
                <li key={e.id} className="flex items-center gap-3 px-5 py-2">
                  <span
                    className={
                      login
                        ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success'
                        : 'flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground'
                    }
                  >
                    {login ? <LogInIcon className="size-4 rtl:-scale-x-100" aria-hidden /> : <LogOutIcon className="size-4 rtl:-scale-x-100" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <bdi dir="ltr" className="truncate text-sm font-medium text-foreground">
                        {e.actorEmail ?? '—'}
                      </bdi>
                      <span className="text-xs text-muted-foreground">{login ? t('activity.login') : t('activity.logout')}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-faint-foreground">
                      {[agent, e.ip].filter(Boolean).join(' · ') || t('activity.noDevice')}
                    </div>
                  </div>
                  <div className="shrink-0 text-end leading-tight">
                    <RelativeTime value={e.createdAt} className="block text-meta text-foreground" />
                    <span className="hidden text-xs text-muted-foreground numeric sm:block">{formatDateTime(e.createdAt, ctx.locale)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );

  const side = (
    <>
      <SectionCard
        title={t('owners.title')}
        description={owners ? t('owners.description', { count: activeOwners }) : undefined}
        icon={<CrownIcon />}
        dense
      >
        {owners === null ? (
          <p className="text-meta text-muted-foreground">{t('owners.noPermission')}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <ul className="flex flex-col gap-2">
              {owners.map((o) => {
                const name = o.fullName?.trim() || o.email || '—';
                return (
                  <li key={o.id} className="flex items-center gap-2.5">
                    <EmployeeAvatar name={name} seed={o.id} size="sm" />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-foreground">{name}</span>
                        {o.isSelf ? (
                          <Badge variant="outline" size="sm">
                            {t('owners.you')}
                          </Badge>
                        ) : null}
                      </div>
                      <bdi dir="ltr" className="block truncate text-xs text-muted-foreground">
                        {o.email}
                      </bdi>
                    </div>
                    {o.status !== 'active' ? <StatusBadge domain="profile" status={o.status} size="sm" /> : null}
                  </li>
                );
              })}
            </ul>
            {activeOwners <= 1 ? (
              <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t('owners.singleOwner')}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{t('owners.hint')}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('password.title')} icon={<KeyRoundIcon />} dense>
        <ul className="flex flex-col gap-1.5 text-meta text-foreground">
          {[
            t('password.minLength', { count: PASSWORD_POLICY.minLength }),
            t('password.upper'),
            t('password.lower'),
            t('password.digit'),
          ].map((rule) => (
            <li key={rule} className="flex items-center gap-2">
              <CheckIcon className="size-3.5 shrink-0 text-success" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{t('password.managed')}</p>
      </SectionCard>

      <SectionCard title={t('email.title')} icon={<MailIcon />} dense>
        <div className="flex items-center justify-between gap-3">
          <span className="text-meta text-muted-foreground">{t('email.provider')}</span>
          {email.configured ? (
            <Badge variant="success" dot>
              {email.provider === 'resend' ? t('email.resend') : t('email.smtp')}
            </Badge>
          ) : (
            <Badge variant="warning" dot>
              {t('email.notConfigured')}
            </Badge>
          )}
        </div>
        {email.from ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-meta text-muted-foreground">{t('email.from')}</span>
            <bdi dir="ltr" className="truncate text-meta text-foreground">
              {email.from}
            </bdi>
          </div>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-muted-foreground">{email.configured ? t('email.configuredHint') : t('email.notConfiguredHint')}</p>
      </SectionCard>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />
      <SplitLayout main={main} side={side} sideWidth="md" />
    </div>
  );
}
