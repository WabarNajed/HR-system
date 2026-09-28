import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { LeaveTypesManager } from '@/features/leave/components/leave-types-manager';
import { LeaveTypesKpis } from '@/features/leave/components/settings-kpis';
import { getLeaveAccess, listLeaveTypes } from '@/features/leave/queries';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.leaveTypes');

/** Settings › Leave › Leave types (master-data pattern; editing needs settings.edit or leave.administer). */
export default async function SettingsLeaveTypesPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/leave-types']);
  const [access, rows, t] = await Promise.all([getLeaveAccess(ctx), listLeaveTypes(), getTranslations()]);
  return (
    <PageStack>
      <LeaveTypesManager
        rows={rows}
        canEdit={access.canConfigure}
        canExport={access.canExportConfig}
        page={{ title: t('nav.settings.items.leaveTypes'), description: t('leave.types.pageDescription'), kpis: <LeaveTypesKpis rows={rows} /> }}
      />
    </PageStack>
  );
}
