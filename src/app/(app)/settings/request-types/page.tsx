import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { RequestTypesManager } from '@/features/request-config/components/request-types-manager';
import { loadRequestTypeRows, loadRoleOptions } from '@/features/request-config/queries';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.requestTypes');

/** Settings › Requests › Request types (catalog, approvals, SLA, activation). */
export default async function SettingsRequestTypesPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/request-types']);
  const supabase = await createClient({ timeoutMs: 10000 });
  let data;
  try {
    data = await Promise.all([loadRequestTypeRows(supabase), loadRoleOptions(supabase)]);
  } catch (error) {
    console.error('[request-config] request types load failed', error);
    const t = await getTranslations('requestConfig.types');
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }
  const [rows, roles] = data;
  return <RequestTypesManager rows={rows} roles={roles} canEdit={can(ctx, 'settings.edit')} />;
}
