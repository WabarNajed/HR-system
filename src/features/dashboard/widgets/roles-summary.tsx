import { ShieldCheckIcon } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { formatInteger } from '@/lib/format';
import { localized } from '@/lib/i18n/localized';
import { RowIcon, ViewAllLink, Widget, WidgetError, WidgetList, WidgetRow } from '../components/widget-parts';
import { getRolesSummary } from '../queries';

/** Roles with the number of users holding each. */
export async function RolesSummaryWidget() {
  const [res, t, locale] = await Promise.all([getRolesSummary(), getTranslations('dashboard.widgets.roles'), getLocale()]);
  return (
    <Widget title={t('title')} icon={ShieldCheckIcon} actions={<ViewAllLink href="/settings/roles" />}>
      {!res.ok ? (
        <WidgetError />
      ) : (
        <WidgetList>
          {res.data.slice(0, 6).map((r) => (
            <WidgetRow key={r.id} href="/settings/roles" className="py-2">
              <RowIcon className="size-7 bg-primary-soft text-primary [&_svg]:size-3.5">
                <ShieldCheckIcon />
              </RowIcon>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.8125rem] font-medium text-foreground">{localized(r, 'name', locale) || r.key}</div>
              </div>
              {!r.is_system ? (
                <Badge variant="outline" size="sm">
                  {t('custom')}
                </Badge>
              ) : null}
              <span className="numeric min-w-8 shrink-0 text-end text-sm font-semibold text-foreground">{formatInteger(r.users, locale)}</span>
            </WidgetRow>
          ))}
        </WidgetList>
      )}
    </Widget>
  );
}
