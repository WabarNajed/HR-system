import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { ProviderStatus } from '@/features/email-templates/components/provider-status';
import { getEmailProviderStatus } from '@/features/email-templates/provider';
import { NotificationMatrix } from '@/features/notification-settings/components/notification-matrix';
import { loadNotificationSettings, type NotificationSettingRow, type TemplateLite } from '@/features/notification-settings/queries';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.notifications');

/** Settings › Communication › Notifications (events × channels, email provider status). */
export default async function SettingsNotificationsPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/notifications']);
  const t = await getTranslations('emailTemplates.notifications');
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: { rows: NotificationSettingRow[]; templates: TemplateLite[] };
  try {
    data = await loadNotificationSettings(supabase);
  } catch (error) {
    console.error('[notification-settings] load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }
  const canEdit = can(ctx, 'settings.edit');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader compact title={t('title')} description={t('description')} />
      <SectionCard dense bodyClassName="py-3.5">
        <ProviderStatus status={getEmailProviderStatus()} email={ctx.profile.email} canTest={canEdit} />
      </SectionCard>
      <NotificationMatrix rows={data.rows} templates={data.templates} canEdit={canEdit} />
    </div>
  );
}
