import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { brandImageUrl } from '@/features/branding/queries';
import { OrganizationForm } from '@/features/settings/components/organization-form';
import {
  countryOptions,
  currencyOptions,
  getOrganizationData,
  monthOptions,
  timezoneOptions,
  weekdayNames,
} from '@/features/settings/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatDateTime } from '@/lib/dates';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.organization');

/** Settings › General › Organization: identity, contact, legal, regional settings and working schedule. */
export default async function SettingsOrganizationPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/organization']);
  const [t, supabase] = await Promise.all([getTranslations('settings.organization'), createClient()]);
  const data = await getOrganizationData(supabase);
  const canEdit = can(ctx, 'settings.edit');
  const canUploadLogo = canEdit && can(ctx, 'settings.administer');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={t('title')}
        description={t('description')}
        actions={
          data.updatedAt ? (
            <span className="text-meta text-muted-foreground">{t('lastUpdated', { date: formatDateTime(data.updatedAt, ctx.locale) })}</span>
          ) : null
        }
      />
      <OrganizationForm
        defaultValues={data.values}
        logoUrl={brandImageUrl('logo', data.logoPath)}
        canEdit={canEdit}
        logoLockedReason={canUploadLogo ? null : t('logoLocked')}
        options={{
          countries: countryOptions(ctx.locale),
          currencies: currencyOptions(ctx.locale, data.values.currency),
          timezones: timezoneOptions(data.values.timezone),
          months: monthOptions(ctx.locale),
          weekdays: weekdayNames(ctx.locale),
        }}
      />
    </div>
  );
}
