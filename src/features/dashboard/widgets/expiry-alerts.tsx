import { FileSignatureIcon, FileTextIcon, HeartPulseIcon, IdCardIcon, PlaneIcon, ShieldAlertIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/i18n/date-format';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { RowIcon, ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getExpiryItems } from '../queries';
import type { ExpiryItem, ExpiryItemKind } from '../types';

/** Employee profile tab where the expiring record lives. */
function itemHref(item: ExpiryItem): string {
  const base = `/employees/${item.employee_id}`;
  if (item.subject === 'dependent') return `${base}?tab=${item.kind === 'insurance' ? 'insurance' : 'dependents'}`;
  if (item.kind === 'document') return `${base}?tab=documents`;
  if (item.kind === 'insurance') return `${base}?tab=insurance`;
  return base;
}

const KIND_ICON: Record<ExpiryItemKind, LucideIcon> = {
  iqama: IdCardIcon,
  passport: PlaneIcon,
  contract: FileSignatureIcon,
  insurance: HeartPulseIcon,
  document: FileTextIcon,
};

/** Expired and soon-to-expire identity items across the organization (most urgent first). */
export async function ExpiryAlertsWidget() {
  const [res, t, tDoc, locale] = await Promise.all([
    getExpiryItems(6),
    getTranslations('dashboard.widgets.expiryAlerts'),
    getTranslations('enums.documentType'),
    getLocale(),
  ]);
  const tt = tDoc as unknown as { has: (k: string) => boolean; (k: string): string };

  return (
    <Widget title={t('title')} description={t('description')} icon={ShieldAlertIcon} actions={<ViewAllLink href="/documents?tab=expiry" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={ShieldCheckIcon} tone="success" title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((item) => {
            const Icon = KIND_ICON[item.kind] ?? FileTextIcon;
            const employeeName = employeeDisplayName({ name_ar: item.employee_name_ar, name_en: item.employee_name_en }, locale);
            const dependentName =
              item.subject === 'dependent' ? employeeDisplayName({ name_ar: item.dependent_name_ar, name_en: item.dependent_name_en }, locale) : '';
            const kindLabel =
              item.kind === 'document' && item.document_type && tt.has(item.document_type) ? tt(item.document_type) : t(`kinds.${item.kind}`);
            const expired = item.days_left < 0;
            const urgent = !expired && item.days_left <= 30;
            return (
              <WidgetRow key={`${item.kind}-${item.subject ?? ''}-${item.entity_id}`} href={itemHref(item)}>
                <RowIcon className={cn(expired ? 'bg-danger-soft text-danger' : urgent ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
                  <Icon />
                </RowIcon>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{dependentName || employeeName}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {kindLabel}
                    <span aria-hidden> · </span>
                    {dependentName ? (
                      <>
                        {t('dependentOf', { name: employeeName })}
                        <span aria-hidden> · </span>
                      </>
                    ) : null}
                    <span className="numeric">{formatDate(item.expiry_date, locale)}</span>
                  </div>
                </div>
                <Badge variant={expired ? 'danger' : urgent ? 'warning' : 'neutral'} size="sm" className="shrink-0">
                  {expired
                    ? t('expiredAgo', { count: Math.abs(item.days_left) })
                    : item.days_left === 0
                      ? t('expiresToday')
                      : t('expiresIn', { count: item.days_left })}
                </Badge>
              </WidgetRow>
            );
          })}
        </WidgetList>
      )}
    </Widget>
  );
}
