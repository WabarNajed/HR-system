import { FileSignatureIcon, FileTextIcon, HeartPulseIcon, IdCardIcon, PlaneIcon, ShieldAlertIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/i18n/date-format';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { cn } from '@/lib/utils';
import { RowIcon, ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getExpiryItems } from '../queries';
import type { ExpiryItemKind } from '../types';

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
    getExpiryItems(7),
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
            const name = employeeDisplayName({ name_ar: item.employee_name_ar, name_en: item.employee_name_en }, locale);
            const kindLabel =
              item.kind === 'document' && item.document_type && tt.has(item.document_type) ? tt(item.document_type) : t(`kinds.${item.kind}`);
            const expired = item.days_left < 0;
            const urgent = !expired && item.days_left <= 30;
            return (
              <WidgetRow
                key={`${item.kind}-${item.entity_id}`}
                href={`/employees/${item.employee_id}${item.kind === 'document' || item.kind === 'insurance' ? `?tab=${item.kind === 'document' ? 'documents' : 'insurance'}` : ''}`}
              >
                <RowIcon className={cn(expired ? 'bg-danger-soft text-danger' : urgent ? 'bg-warning-soft text-warning' : 'bg-muted text-muted-foreground')}>
                  <Icon />
                </RowIcon>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-sm font-medium text-foreground">{name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {kindLabel}
                    <span aria-hidden> · </span>
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
