import { UserCogIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ViewAllLink, Widget, WidgetError } from '../components/widget-parts';
import { getDashboardStats } from '../queries';

const STATUSES = [
  { key: 'active', bar: 'bg-success', dot: 'bg-success' },
  { key: 'pending', bar: 'bg-warning', dot: 'bg-warning' },
  { key: 'info_requested', bar: 'bg-secondary', dot: 'bg-secondary' },
  { key: 'disabled', bar: 'bg-border-strong', dot: 'bg-border-strong' },
  { key: 'rejected', bar: 'bg-danger', dot: 'bg-danger' },
] as const;

/** Portal accounts by status (active / pending / info requested / disabled / rejected). */
export async function UsersSummaryWidget() {
  const [stats, t, tStatus, locale] = await Promise.all([
    getDashboardStats(),
    getTranslations('dashboard.widgets.users'),
    getTranslations('statuses.profile'),
    getLocale(),
  ]);
  const admin = stats.ok ? stats.data.admin : undefined;
  return (
    <Widget title={t('title')} icon={UserCogIcon} actions={<ViewAllLink href="/settings/users" />}>
      {!admin ? (
        <WidgetError />
      ) : (
        <div className="flex flex-col gap-4 px-4 py-3.5">
          <div className="flex items-baseline gap-2">
            <span className="numeric text-2xl leading-8 font-semibold text-foreground">{formatInteger(admin.users_total, locale)}</span>
            <span className="text-meta text-muted-foreground">{t('total')}</span>
          </div>
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            {STATUSES.map(({ key, bar }) => {
              const value = admin.users_by_status[key] ?? 0;
              if (!value || !admin.users_total) return null;
              return <div key={key} className={cn('h-full first:rounded-s-full last:rounded-e-full', bar)} style={{ width: `${(value / admin.users_total) * 100}%` }} />;
            })}
          </div>
          <ul className="flex flex-col gap-1.5">
            {STATUSES.map(({ key, dot }) => {
              const value = admin.users_by_status[key] ?? 0;
              if (!value && (key === 'rejected' || key === 'info_requested')) return null;
              const href = key === 'pending' || key === 'info_requested' ? '/settings/pending-registrations' : `/settings/users?status=${key}`;
              return (
                <li key={key}>
                  <Link href={href} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1 text-[0.8125rem] outline-none hover:bg-accent/60 focus-visible:bg-accent">
                    <span className={cn('size-2 rounded-full', dot)} aria-hidden />
                    <span className="flex-1 text-foreground">{tStatus(key)}</span>
                    <span className="numeric font-semibold text-foreground">{formatInteger(value, locale)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Widget>
  );
}
