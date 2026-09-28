import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { SlaSettings } from '@/features/request-config/components/sla-settings';
import { loadOrgCalendar, loadRequestTypeRows, loadRoleOptions } from '@/features/request-config/queries';
import { requireAccess } from '@/lib/auth/guards';
import { toIsoDate } from '@/lib/dates';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.sla');

/** Settings › Requests › SLA (business-day targets and live performance). */
export default async function SettingsSlaPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/sla']);
  const supabase = await createClient({ timeoutMs: 10000 });
  let data;
  try {
    data = await Promise.all([loadRequestTypeRows(supabase), loadOrgCalendar(supabase, toIsoDate(new Date())), loadRoleOptions(supabase)]);
  } catch (error) {
    console.error('[request-config] sla load failed', error);
    const t = await getTranslations('requestConfig.sla');
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }
  const [rows, calendar, roles] = data;
  return <SlaSettings rows={rows} calendar={calendar} roles={roles} canEdit={can(ctx, 'settings.edit')} />;
}
