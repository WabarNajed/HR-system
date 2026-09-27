import { Building2Icon, GlobeIcon, UsersIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { localized } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { DepartmentBarChart, NationalityMix, type ChartDatum } from '../components/headcount-charts';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError } from '../components/widget-parts';
import { getEmployeeBreakdown } from '../queries';

const MAX_DEPARTMENTS = 8;

function PaneTitle({ icon: Icon, title, meta }: { icon: typeof GlobeIcon; title: string; meta?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      <h3 className="text-[0.8125rem] font-semibold text-foreground">{title}</h3>
      {meta ? <span className="ms-auto text-xs text-muted-foreground">{meta}</span> : null}
    </div>
  );
}

/**
 * Workforce overview: active headcount, headcount by department (top 8 + "Other") and the
 * nationality mix (top 5 + "Other"). `split` puts the two charts side by side (wide slot).
 */
export async function WorkforceOverviewWidget({ split = false }: { split?: boolean }) {
  const [res, t, locale] = await Promise.all([getEmployeeBreakdown(), getTranslations('dashboard.widgets.overview'), getLocale()]);
  let body;
  if (!res.ok) body = <WidgetError />;
  else if (res.data.total === 0) body = <WidgetEmpty icon={UsersIcon} title={t('emptyTitle')} description={t('emptyDescription')} />;
  else {
    const rows = res.data.by_department.map<ChartDatum>((d) => ({
      key: d.id ?? '__none',
      label: d.id ? localized(d, 'name', locale) || t('unassigned') : t('unassigned'),
      value: d.count,
    }));
    const top = rows.slice(0, MAX_DEPARTMENTS);
    const rest = rows.slice(MAX_DEPARTMENTS).reduce((sum, d) => sum + d.value, 0);
    const departments = rest > 0 ? [...top, { key: '__other', label: t('other'), value: rest }] : top;
    const nationalities = res.data.by_nationality.map<ChartDatum>((d, i) => ({
      key: d.nationality ? `n${i}` : '__unknown',
      label: d.nationality ?? t('unknownNationality'),
      value: d.count,
    }));
    const named = res.data.by_department.filter((d) => d.id).length;
    body = (
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline gap-2 border-b border-border px-4 py-3">
          <span className="numeric text-2xl leading-8 font-semibold tracking-tight text-foreground">{formatInteger(res.data.total, locale)}</span>
          <span className="text-meta text-muted-foreground">{t('employees')}</span>
          <span className="ms-auto text-xs text-muted-foreground">
            {t('departmentsCount', { count: named })} · {t('nationalitiesCount', { count: res.data.by_nationality.length })}
          </span>
        </div>
        <div className={cn('grid flex-1 grid-cols-1', split && 'md:grid-cols-2')}>
          <section className="px-4 pt-3 pb-4">
            <PaneTitle icon={Building2Icon} title={t('byDepartment')} />
            <DepartmentBarChart data={departments} total={res.data.total} />
          </section>
          <section className={cn('border-border px-4 pt-3 pb-4', split ? 'border-t md:border-t-0 md:border-s' : 'border-t')}>
            <PaneTitle icon={GlobeIcon} title={t('byNationality')} />
            <NationalityMix data={nationalities} total={res.data.total} otherLabel={t('other')} />
          </section>
        </div>
      </div>
    );
  }
  return (
    <Widget title={t('title')} icon={UsersIcon} actions={<ViewAllLink href="/employees" />}>
      {body}
    </Widget>
  );
}
