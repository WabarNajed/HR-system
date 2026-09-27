import {
  CalendarPlusIcon,
  ClipboardCheckIcon,
  FileBadgeIcon,
  FilePlus2Icon,
  InboxIcon,
  ScrollTextIcon,
  UserCogIcon,
  UserPlusIcon,
  WandSparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import type { SessionContext } from '@/lib/auth/session';
import { DEFAULT_TIME_ZONE, intlLocale } from '@/lib/i18n/config';
import { formatDate, formatHijriDate } from '@/lib/i18n/date-format';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { can } from '@/lib/permissions';

type QuickActionKey =
  | 'newRequest'
  | 'addEmployee'
  | 'requestQueue'
  | 'manageUsers'
  | 'setupWizard'
  | 'auditLog'
  | 'reviewApprovals'
  | 'requestLeave'
  | 'requestCertificate';
type QuickAction = { key: QuickActionKey; href: string; icon: LucideIcon; primary?: boolean };

/** Role-aware quick actions (max 3), primary action last so it sits at the logical end. */
export function quickActionsFor(ctx: SessionContext, view: { hr: boolean; manager: boolean; admin: boolean }): QuickAction[] {
  const canRequest = Boolean(ctx.employee) && can(ctx, 'requests.create');
  const newRequest: QuickAction = { key: 'newRequest', href: '/requests/new', icon: FilePlus2Icon, primary: true };
  if (view.hr) {
    const out: QuickAction[] = [];
    if (can(ctx, 'employees.create')) out.push({ key: 'addEmployee', href: '/employees/new', icon: UserPlusIcon });
    out.push({ key: 'requestQueue', href: '/requests', icon: InboxIcon });
    if (canRequest) out.push(newRequest);
    else if (view.admin) out.push({ key: 'manageUsers', href: '/settings/users', icon: UserCogIcon, primary: true });
    return out;
  }
  if (view.admin) {
    return [
      { key: 'setupWizard', href: '/setup', icon: WandSparklesIcon },
      { key: 'auditLog', href: '/admin/audit-logs', icon: ScrollTextIcon },
      { key: 'manageUsers', href: '/settings/users', icon: UserCogIcon, primary: true },
    ];
  }
  if (view.manager) {
    const out: QuickAction[] = [{ key: 'reviewApprovals', href: '/approvals', icon: ClipboardCheckIcon }];
    if (canRequest) out.push({ key: 'requestLeave', href: '/requests/new?type=leave', icon: CalendarPlusIcon }, newRequest);
    return out;
  }
  if (!canRequest) return [];
  return [
    { key: 'requestLeave', href: '/requests/new?type=leave', icon: CalendarPlusIcon },
    { key: 'requestCertificate', href: '/requests/new?type=certificate', icon: FileBadgeIcon },
    newRequest,
  ];
}

function greetingKey(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: DEFAULT_TIME_ZONE }).format(now));
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/** Greeting, role, Gregorian + Hijri date and quick actions. */
export async function DashboardHeader({
  ctx,
  today,
  view,
}: {
  ctx: SessionContext;
  today: string;
  view: { hr: boolean; manager: boolean; admin: boolean };
}) {
  const t = await getTranslations('dashboard');
  const tRoles = await getTranslations('common.roleNames');
  const locale = ctx.locale;
  const now = new Date();
  const name = employeeDisplayName(ctx.employee, locale) || ctx.profile.fullName || ctx.user.email || '';
  const weekday = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${today}T00:00:00Z`));
  const role = ctx.roleDetails.find((r) => r.key === ctx.primaryRole);
  const tr = tRoles as unknown as { has: (k: string) => boolean; (k: string): string };
  const roleLabel =
    (role ? localized({ name_ar: role.nameAr, name_en: role.nameEn }, 'name', locale) : '') ||
    (ctx.primaryRole && tr.has(ctx.primaryRole) ? tr(ctx.primaryRole) : '');
  const actions = quickActionsFor(ctx, view);
  const jobTitle = ctx.employee?.job_title ? localized(ctx.employee.job_title, 'name', locale) : '';

  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-meta text-muted-foreground">
          <span className="font-medium text-foreground/80">{weekday}</span>
          <span aria-hidden>·</span>
          <time dateTime={today} className="numeric">
            {formatDate(today, locale, { month: 'long' })}
          </time>
          <span aria-hidden>·</span>
          <span className="numeric">{t('hijriDate', { date: formatHijriDate(today, locale) })}</span>
        </p>
        <h1 className="mt-1 truncate text-page-title text-foreground">{t(`greeting.${greetingKey(now)}`, { name })}</h1>
        {roleLabel || jobTitle ? (
          <p className="mt-1 truncate text-sm text-muted-foreground">{[jobTitle, roleLabel].filter(Boolean).join(' · ')}</p>
        ) : null}
      </div>
      {actions.length ? (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Button key={a.key} asChild size="sm" variant={a.primary ? 'default' : 'outline'} className="max-sm:flex-1">
                <Link href={a.href}>
                  <Icon />
                  {t(`actions.${a.key}`)}
                </Link>
              </Button>
            );
          })}
        </div>
      ) : null}
    </header>
  );
}
