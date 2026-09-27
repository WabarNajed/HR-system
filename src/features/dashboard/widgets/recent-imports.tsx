import { FileSpreadsheetIcon, UploadIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatRelative } from '@/lib/dates';
import { formatInteger } from '@/lib/format';
import { RowIcon, ViewAllLink, Widget, WidgetEmpty, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getRecentImports } from '../queries';

/** Latest data imports with their status and row counts. */
export async function RecentImportsWidget() {
  const [res, t, tType, locale] = await Promise.all([
    getRecentImports(),
    getTranslations('dashboard.widgets.imports'),
    getTranslations('enums.importType'),
    getLocale(),
  ]);
  const tt = tType as unknown as { has: (k: string) => boolean; (k: string): string };
  return (
    <Widget title={t('title')} icon={UploadIcon} actions={<ViewAllLink href="/admin/data-management" />}>
      {!res.ok ? (
        <WidgetError />
      ) : res.data.length === 0 ? (
        <WidgetEmpty icon={FileSpreadsheetIcon} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <WidgetList>
          {res.data.map((i) => (
            <WidgetRow key={i.id} href="/admin/data-management" className="py-2">
              <RowIcon className="bg-success-soft text-success">
                <FileSpreadsheetIcon />
              </RowIcon>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[0.8125rem] font-medium text-foreground">{tt.has(i.import_type) ? tt(i.import_type) : i.import_type}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {t('rows', { imported: formatInteger(i.imported_rows, locale), total: formatInteger(i.total_rows, locale) })}
                  <span aria-hidden> · </span>
                  {formatRelative(i.created_at, locale)}
                </div>
              </div>
              <StatusBadge domain="import" status={i.status} size="sm" />
            </WidgetRow>
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}
