import { Building2Icon, GlobeIcon, UsersIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { formatInteger } from '@/lib/format';
import { localized } from '@/lib/i18n/localized';
import { DepartmentBarChart, NationalityMix, type ChartDatum } from '../components/headcount-charts';
import { ViewAllLink, Widget, WidgetEmpty, WidgetError } from '../components/widget-parts';
import { getEmployeeBreakdown } from '../queries';

const MAX_DEPARTMENTS = 8;

function Headline({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="numeric text-2xl leading-8 font-semibold tracking-tight text-foreground">{value}</span>
      <span className="text-meta text-muted-foreground">{label}</span>
      {sub ? <span className="ms-auto text-xs text-faint-foreground">{sub}</span> : null}
    </div>
  );
}

/** Headcount by department (active workforce), top 8 + "Other". */
export async function DepartmentHeadcountWidget() {
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
    const data = rest > 0 ? [...top, { key: '__other', label: t('other'), value: rest }] : top;
    const named = res.data.by_department.filter((d) => d.id).length;
    body = (
      <div className="px-4 pt-3 pb-4">
        <Headline
          value={formatInteger(res.data.total, locale)}
          label={t('employees')}
          sub={t('departmentsCount', { count: named })}
        />
        <DepartmentBarChart data={data} total={res.data.total} />
      </div>
    );
  }
  return (
    <Widget title={t('byDepartment')} icon={Building2Icon} actions={<ViewAllLink href="/employees" />}>
      {body}
    </Widget>
  );
}

/** Nationality mix of the active workforce (values as recorded), top 5 + "Other". */
export async function NationalityMixWidget() {
  const [res, t, locale] = await Promise.all([getEmployeeBreakdown(), getTranslations('dashboard.widgets.overview'), getLocale()]);
  let body;
  if (!res.ok) body = <WidgetError />;
  else if (res.data.total === 0) body = <WidgetEmpty icon={GlobeIcon} title={t('emptyTitle')} description={t('emptyDescription')} />;
  else {
    const data = res.data.by_nationality.map<ChartDatum>((d, i) => ({
      key: d.nationality ? `n${i}` : '__unknown',
      label: d.nationality ?? t('unknownNationality'),
      value: d.count,
    }));
    body = (
      <div className="px-4 pt-3 pb-4">
        <Headline value={formatInteger(res.data.by_nationality.length, locale)} label={t('nationalities')} />
        <NationalityMix data={data} total={res.data.total} otherLabel={t('other')} />
      </div>
    );
  }
  return (
    <Widget title={t('byNationality')} icon={GlobeIcon}>
      {body}
    </Widget>
  );
}
