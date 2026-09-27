import { ActivityIcon, ScrollTextIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { auditActionLabel, type AuditTranslator } from '@/features/audit/labels';
import { formatInteger } from '@/lib/format';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError } from '../components/widget-parts';
import { getAuditActivity24h } from '../queries';

/** Audit events of the last 24 hours grouped by action (ranked bars, one hue). */
export async function AuditActivityWidget() {
  const [res, t, tRoot, locale] = await Promise.all([
    getAuditActivity24h(),
    getTranslations('dashboard.widgets.auditActivity'),
    getTranslations(),
    getLocale(),
  ]);
  const ta = tRoot as unknown as AuditTranslator;
  const total = res.ok ? res.data.reduce((sum, r) => sum + r.total, 0) : 0;
  const top = res.ok ? res.data.slice(0, 6) : [];
  const max = top[0]?.total ?? 1;
  return (
    <Widget title={t('title')} icon={ActivityIcon} actions={<ViewAllLink href="/admin/audit-logs" />}>
      {!res.ok ? (
        <WidgetError />
      ) : total === 0 ? (
        <WidgetEmpty icon={ScrollTextIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <div className="flex items-baseline gap-2">
            <span className="numeric text-2xl leading-8 font-semibold text-foreground">{formatInteger(total, locale)}</span>
            <span className="text-meta text-muted-foreground">{t('events')}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {top.map((r) => {
              const href = `/admin/audit-logs?action=${encodeURIComponent(r.action)}`;
              return (
                <li key={r.action}>
                  <Link href={href} className="group/bar -mx-2 block rounded-md px-2 py-1 outline-none hover:bg-accent/60 focus-visible:bg-accent">
                    <div className="flex items-center justify-between gap-2 text-[0.8125rem]">
                      <span className="truncate text-foreground">{auditActionLabel(ta, r.action)}</span>
                      <span className="numeric shrink-0 font-semibold text-foreground">{formatInteger(r.total, locale)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(4, (r.total / max) * 100)}%` }} />
                    </div>
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
