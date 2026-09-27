import 'server-only';

import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  InfoIcon,
  RocketIcon,
  ShieldCheckIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { BrandMark } from '@/components/shell/brand-mark';
import { ROUTE_ACCESS, SETTINGS_HOME_CARDS, SETTINGS_ITEMS_BY_KEY, type SettingsItemKey } from '@/components/shell/nav-config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { brandImageUrl } from '@/features/branding/queries';
import type { SessionContext } from '@/lib/auth/session';
import { formatDate } from '@/lib/dates';
import { emailProvider } from '@/lib/email/send';
import { checkAccess } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { cn, DEFAULT_BRAND_COLORS, normalizeHex } from '@/lib/utils';
import { getSettingsOverview, type SettingsOverview } from '../overview';
import { weekdayNames } from '../queries';

type Tone = 'ok' | 'warn' | 'muted';
type ItemStatus = { text: string; tone: Tone } | null;
type Severity = 'high' | 'medium' | 'low';
type HealthCheck = { key: string; ok: boolean; severity: Severity; title: string; description: string; href?: string };

const chevron = 'size-4 shrink-0 text-faint-foreground transition-transform rtl:rotate-180';

const toneDot: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  muted: 'bg-border-strong',
};

function name(locale: 'ar' | 'en', ar: string | null | undefined, en: string | null | undefined): string | null {
  return (locale === 'ar' ? ar?.trim() || en?.trim() : en?.trim() || ar?.trim()) || null;
}

/** "Sun – Thu" for contiguous days, else a comma list (0 = Sunday). */
function dayRange(days: number[], names: { short: string }[], locale: 'ar' | 'en'): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (!sorted.length) return '—';
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  if (contiguous && sorted.length > 2) return `${names[sorted[0]!]!.short} – ${names[sorted[sorted.length - 1]!]!.short}`;
  return sorted.map((d) => names[d]!.short).join(locale === 'ar' ? '، ' : ', ');
}

/** Settings console home: organization snapshot, grouped section cards with live status, configuration health. */
export async function SettingsHome({ ctx }: { ctx: SessionContext }) {
  const locale = ctx.locale;
  const [t, tNav, supabase] = await Promise.all([getTranslations('settings.home'), getTranslations('nav.settings'), createClient()]);
  const o: SettingsOverview = (await getSettingsOverview(supabase)) ?? {};
  const can = (key: SettingsItemKey) => checkAccess(ctx, SETTINGS_ITEMS_BY_KEY[key].access);

  /* ─── Live status per console item ─────────────────────────────────────── */
  const counted = (c: { total: number; inactive: number } | undefined, emptyKey: 'departments' | 'jobTitles' | 'locations' | 'costCenters'): ItemStatus => {
    if (!c) return null;
    if (!c.total) return { text: t(`status.empty.${emptyKey}`), tone: 'warn' };
    return { text: t('status.counted', { total: c.total, inactive: c.inactive }), tone: 'ok' };
  };
  const org = o.organization;
  const st = o.settings;
  const companyName = name(locale, org?.name_ar, org?.name_en);
  const customColors =
    st && (normalizeHex(st.primary_color) !== DEFAULT_BRAND_COLORS.primary || normalizeHex(st.secondary_color) !== DEFAULT_BRAND_COLORS.secondary);

  const status: Partial<Record<SettingsItemKey, ItemStatus>> = {
    organization: org
      ? companyName
        ? { text: org.commercial_registration ? t('status.orgWithCr', { name: companyName, cr: org.commercial_registration }) : companyName, tone: 'ok' }
        : { text: t('status.orgMissingName'), tone: 'warn' }
      : null,
    branding: st
      ? {
          text: `${customColors ? t('status.customColors') : t('status.defaultColors')} · ${org?.has_logo ? t('status.logoUploaded') : t('status.logoMissing')}`,
          tone: org?.has_logo ? 'ok' : 'warn',
        }
      : null,
    users: o.users ? { text: t('status.users', { active: o.users.active, disabled: o.users.disabled }), tone: 'ok' } : null,
    roles: o.roles ? { text: t('status.roles', { total: o.roles.total, custom: o.roles.custom }), tone: 'muted' } : null,
    pendingRegistrations: o.users
      ? o.users.pending
        ? { text: t('status.pending', { count: o.users.pending }), tone: 'warn' }
        : { text: t('status.noPending'), tone: 'ok' }
      : null,
    departments: counted(o.departments, 'departments'),
    jobTitles: counted(o.job_titles, 'jobTitles'),
    locations: counted(o.locations, 'locations'),
    costCenters: counted(o.cost_centers, 'costCenters'),
    leaveTypes: o.leave_types ? { text: t('status.leaveTypes', { active: o.leave_types.total - o.leave_types.inactive }), tone: 'ok' } : null,
    publicHolidays: o.public_holidays
      ? o.public_holidays.this_year
        ? { text: t('status.holidays', { count: o.public_holidays.this_year, upcoming: o.public_holidays.upcoming }), tone: 'ok' }
        : { text: t('status.noHolidays', { year: new Date().getFullYear() }), tone: 'warn' }
      : null,
    requestTypes: o.request_types
      ? { text: t('status.requestTypes', { active: o.request_types.total - o.request_types.inactive, inactive: o.request_types.inactive }), tone: 'ok' }
      : null,
    formBuilder: o.request_fields ? { text: t('status.fields', { count: o.request_fields.total }), tone: 'muted' } : null,
    workflows:
      o.workflows !== undefined
        ? o.request_types_without_workflow
          ? { text: t('status.withoutWorkflow', { count: o.request_types_without_workflow }), tone: 'warn' }
          : { text: t('status.workflows', { count: o.workflows.total }), tone: 'ok' }
        : null,
    sla: o.sla ? { text: t('status.sla', { count: o.sla.with_sla, total: o.sla.total }), tone: o.sla.with_sla < o.sla.total ? 'muted' : 'ok' } : null,
    certificateTemplates: o.certificate_templates
      ? { text: t('status.templates', { total: o.certificate_templates.total, inactive: o.certificate_templates.inactive }), tone: 'ok' }
      : null,
    emailTemplates: o.email_templates ? { text: t('status.templates', { total: o.email_templates.total, inactive: o.email_templates.inactive }), tone: 'ok' } : null,
    notifications: o.notification_rules
      ? { text: t('status.notifications', { total: o.notification_rules.total, email: o.notification_rules.email_enabled }), tone: 'muted' }
      : null,
    security: st
      ? {
          text: `${t('status.session', { hours: Math.round((st.session_timeout_minutes / 60) * 10) / 10 })} · ${
            st.allow_self_registration ? t('status.selfRegistrationOn') : t('status.selfRegistrationOff')
          }`,
          tone: 'muted',
        }
      : null,
    dataManagement: o.imports
      ? o.imports.total
        ? { text: t('status.imports', { count: o.imports.total, date: o.imports.last_at ? formatDate(o.imports.last_at, locale) : '—' }), tone: 'ok' }
        : { text: t('status.noImports'), tone: 'muted' }
      : null,
    auditLog: o.audit ? { text: t('status.audit', { count: o.audit.last_7_days }), tone: 'muted' } : null,
  };

  const cards = SETTINGS_HOME_CARDS.map((card) => ({ ...card, items: card.items.filter(can) })).filter((card) => card.items.length > 0);

  /* ─── Configuration health ──────────────────────────────────────────────── */
  const checks: HealthCheck[] = [];
  const add = (key: string, ok: boolean, severity: Severity, href?: string, values?: Record<string, string | number>) =>
    checks.push({
      key,
      ok,
      severity,
      href,
      title: t(`health.checks.${key}.title` as 'health.checks.companyName.title', values),
      description: t(`health.checks.${key}.${ok ? 'ok' : 'issue'}` as 'health.checks.companyName.ok', values),
    });
  if (org && st) {
    add('companyName', Boolean(companyName), 'high', '/settings/organization');
    add('logo', org.has_logo, 'medium', '/settings/branding');
    add('hrEmail', Boolean(org.hr_email), 'medium', '/settings/organization');
    add('legal', Boolean(org.commercial_registration), 'low', '/settings/organization');
    add('certificateAssets', st.has_stamp && st.has_signature && st.has_signatory, 'low', '/settings/branding');
  }
  if (o.departments) add('departments', o.departments.total - o.departments.inactive > 0, 'high', '/settings/departments');
  if (o.job_titles) add('jobTitles', o.job_titles.total - o.job_titles.inactive > 0, 'high', '/settings/job-titles');
  if (o.locations) add('locations', o.locations.total - o.locations.inactive > 0, 'low', '/settings/locations');
  if (o.hr_admins !== undefined) add('hrAdmin', o.hr_admins > 0, 'high', can('users') ? '/settings/users' : undefined);
  if (o.request_types_without_workflow !== undefined)
    add('workflows', o.request_types_without_workflow === 0, 'medium', '/settings/workflows', { count: o.request_types_without_workflow });
  if (o.public_holidays) add('holidays', o.public_holidays.this_year > 0, 'low', can('publicHolidays') ? '/settings/public-holidays' : undefined, { year: new Date().getFullYear() });
  if (st) add('email', emailProvider() !== null, 'medium');
  if (st && checkAccess(ctx, ROUTE_ACCESS['/setup'])) add('setup', Boolean(st.setup_completed_at), 'medium', '/setup');

  const issues = checks.filter((c) => !c.ok).sort((a, b) => ['high', 'medium', 'low'].indexOf(a.severity) - ['high', 'medium', 'low'].indexOf(b.severity));
  const passed = checks.filter((c) => c.ok);
  const score = checks.length ? Math.round((passed.length / checks.length) * 100) : 100;

  /* ─── Organization snapshot ─────────────────────────────────────────────── */
  const weekdays = weekdayNames(locale);
  const portalName = name(locale, st?.portal_name_ar, st?.portal_name_en) ?? t('snapshot.unnamed');
  const otherName = name(locale === 'ar' ? 'en' : 'ar', org?.name_ar, org?.name_en);
  const showSetup = st && !st.setup_completed_at && checkAccess(ctx, ROUTE_ACCESS['/setup']);
  const logo = org?.has_logo ? await logoUrl(supabase) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={tNav('title')}
        description={tNav('description')}
        actions={
          showSetup ? (
            <Button asChild>
              <Link href="/setup">
                <RocketIcon />
                {t('continueSetup')}
              </Link>
            </Button>
          ) : null
        }
      />

      {org && st ? (
        <section
          aria-label={t('snapshot.title')}
          className="relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-card md:flex-row md:items-center md:gap-5 md:p-5"
        >
          <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-primary to-secondary" />
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <BrandMark name={companyName ?? portalName} logoUrl={logo} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="truncate text-section-title text-foreground">{companyName ?? t('snapshot.unnamed')}</h2>
                {!companyName ? (
                  <Badge variant="warning" size="sm">
                    {t('snapshot.incomplete')}
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-meta text-muted-foreground">
                {[otherName && otherName !== companyName ? otherName : null, t('snapshot.portal', { name: portalName })].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-meta sm:grid-cols-4 md:shrink-0">
            {[
              { label: t('snapshot.workWeek'), value: dayRange(st.working_days, weekdays, locale) },
              { label: t('snapshot.hours'), value: `${st.work_start.slice(0, 5)} – ${st.work_end.slice(0, 5)}`, ltr: true },
              { label: t('snapshot.currency'), value: st.currency, ltr: true },
              { label: t('snapshot.timezone'), value: st.timezone.replace(/_/g, ' '), ltr: true },
            ].map((item) => (
              <div key={item.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="truncate font-medium text-foreground" dir={item.ltr ? 'ltr' : undefined}>
                  <span className={item.ltr ? 'ltr-isolate' : undefined}>{item.value}</span>
                </dd>
              </div>
            ))}
          </dl>
          {can('organization') ? (
            <Button asChild variant="outline" size="sm" className="self-start md:self-center">
              <Link href="/settings/organization">
                {t('snapshot.edit')}
                <ArrowUpRightIcon className="rtl:-scale-x-100" />
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* Grouped section cards */}
        <div className="columns-1 gap-4 md:columns-2 [&>*]:mb-4">
          {cards.map((card) => {
            const Icon = card.icon;
            const single = card.items.length === 1 ? SETTINGS_ITEMS_BY_KEY[card.items[0]!] : null;
            const singleStatus = single ? status[single.key] : null;
            const header = (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-inset ring-current/10">
                  <Icon className="size-[1.125rem]" strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-card-title text-foreground">{tNav(`cards.${card.key}`)}</h2>
                  <p className="mt-0.5 text-meta text-muted-foreground">{single ? tNav(`descriptions.${single.key}`) : tNav(`cardDescriptions.${card.key}`)}</p>
                  {singleStatus ? <StatusLine status={singleStatus} className="mt-2" /> : null}
                </div>
                {single ? <ChevronRightIcon className={`${chevron} mt-2.5 group-hover:text-primary`} aria-hidden /> : null}
              </div>
            );
            if (single) {
              return (
                <Link
                  key={card.key}
                  href={single.href}
                  data-settings-card={card.key}
                  className="group block break-inside-avoid rounded-lg border border-border bg-card shadow-card transition-colors outline-none hover:border-border-strong hover:bg-subtle focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {header}
                </Link>
              );
            }
            return (
              <section key={card.key} data-settings-card={card.key} className="break-inside-avoid rounded-lg border border-border bg-card shadow-card">
                {header}
                <ul className="border-t border-border px-1.5 py-1.5">
                  {card.items.map((key) => {
                    const item = SETTINGS_ITEMS_BY_KEY[key];
                    const ItemIcon = item.icon;
                    const s = status[key];
                    return (
                      <li key={key}>
                        <Link
                          href={item.href}
                          className="group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <ItemIcon className="size-4 shrink-0 text-faint-foreground group-hover:text-primary" strokeWidth={1.85} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-foreground">{tNav(`items.${key}`)}</span>
                            {s ? (
                              <StatusLine status={s} />
                            ) : (
                              <span className="block truncate text-xs text-muted-foreground">{tNav(`descriptions.${key}`)}</span>
                            )}
                          </span>
                          <ChevronRightIcon className={`${chevron} group-hover:text-primary`} aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {/* Configuration health */}
        {checks.length ? (
          <section aria-labelledby="config-health" className="rounded-lg border border-border bg-card shadow-card xl:sticky xl:top-[calc(var(--spacing-header)+1rem)]">
            <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
              <HealthRing score={score} />
              <div className="min-w-0 flex-1">
                <h2 id="config-health" className="text-card-title text-foreground">
                  {t('health.title')}
                </h2>
                <p className="mt-0.5 text-meta text-muted-foreground">{t('health.summary', { passed: passed.length, total: checks.length })}</p>
              </div>
            </div>
            {issues.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {issues.map((c) => (
                  <li key={c.key} className="flex gap-3 px-4 py-3" data-health-issue={c.key}>
                    <SeverityIcon severity={c.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground">{c.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.description}</p>
                      {c.href ? (
                        <Link href={c.href} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline hover:underline-offset-4">
                          {t(`health.actions.${c.key}` as 'health.actions.companyName')}
                          <ChevronRightIcon className="size-3.5 rtl:rotate-180" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4">
                <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success">
                  <ShieldCheckIcon className="size-4" aria-hidden />
                </span>
                <p className="text-sm text-foreground">{t('health.allGood')}</p>
              </div>
            )}
            {passed.length ? (
              <details className="group border-t border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-meta font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  {t('health.passed', { count: passed.length })}
                  <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <ul className="flex flex-col gap-2 px-4 pb-3.5">
                  {passed.map((c) => (
                    <li key={c.key} className="flex items-start gap-2 text-xs">
                      <CheckCircle2Icon className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{c.title}</span>
                        <span className="text-muted-foreground"> · {c.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

async function logoUrl(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from('organizations').select('logo_path').maybeSingle();
  return brandImageUrl('logo', data?.logo_path ?? null);
}

function StatusLine({ status, className }: { status: NonNullable<ItemStatus>; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5 text-xs', status.tone === 'warn' ? 'text-warning-soft-foreground' : 'text-muted-foreground', className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', toneDot[status.tone])} />
      <span className="truncate">{status.text}</span>
    </span>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  const map = {
    high: { icon: AlertCircleIcon, cls: 'bg-danger-soft text-danger' },
    medium: { icon: AlertTriangleIcon, cls: 'bg-warning-soft text-warning' },
    low: { icon: InfoIcon, cls: 'bg-info-soft text-info' },
  } as const;
  const { icon: Icon, cls } = map[severity];
  return (
    <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', cls)}>
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

function HealthRing({ score }: { score: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger';
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="size-11 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
          className={cn('stroke-current', tone)}
        />
      </svg>
      <span className="absolute text-[0.6875rem] font-semibold text-foreground numeric">{score}%</span>
    </span>
  );
}
