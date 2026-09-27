import { UploadIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { Button } from '@/components/ui/button';
import { HolidaysManager } from '@/features/leave/components/holidays-manager';
import { HolidaysKpis } from '@/features/leave/components/settings-kpis';
import { getHolidayYears, getLeaveAccess, getLeaveOrgSettings, listHolidaysForYear } from '@/features/leave/queries';
import { requireAccess } from '@/lib/auth/guards';
import { checkAccess } from '@/lib/permissions';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.publicHolidays');

/** Settings › Leave › Public holidays (year filter; holidays drive leave day counts and SLA dates). */
export default async function SettingsPublicHolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/public-holidays']);
  const sp = await searchParams;
  const [access, settings, t] = await Promise.all([getLeaveAccess(ctx), getLeaveOrgSettings(), getTranslations()]);
  const rawYear = Number(Array.isArray(sp.year) ? sp.year[0] : sp.year);
  const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2200 ? rawYear : settings.year;
  const [rows, years] = await Promise.all([listHolidaysForYear(year, settings), getHolidayYears(settings.year)]);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => b - a);
  const canImport = access.canConfigure && checkAccess(ctx, ROUTE_ACCESS['/admin/data-management']);

  return (
    <PageStack>
      <PageHeader
        compact
        title={t('nav.settings.items.publicHolidays')}
        description={t('leave.holidays.pageDescription')}
        actions={
          canImport ? (
            <Button variant="outline" size="sm" asChild>
              <Link href="/admin/data-management?type=public_holidays">
                <UploadIcon />
                {t('common.import')}
              </Link>
            </Button>
          ) : null
        }
      />
      <HolidaysKpis rows={rows} year={year} today={settings.today} />
      <HolidaysManager rows={rows} year={year} years={years} currentYear={settings.year} today={settings.today} canEdit={access.canConfigure} />
    </PageStack>
  );
}
