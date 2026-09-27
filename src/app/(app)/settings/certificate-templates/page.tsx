import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { NewTemplateButton, TemplatesManager } from '@/features/certificates/components/templates-manager';
import { listTemplates } from '@/features/certificates/server/queries';
import { CERTIFICATE_TYPES } from '@/features/certificates/variables';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.certificateTemplates');

/** Certificate types only (salary, employment, salary & employment, experience) — custom HR letters live in Document templates. */
const CERTIFICATE_ONLY = CERTIFICATE_TYPES.filter((type) => type !== 'custom');

/** Settings › Documents › Certificate templates: the document template list filtered to certificates. */
export default async function SettingsCertificateTemplatesPage() {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/certificate-templates']);
  const [t, supabase] = await Promise.all([getTranslations('templates'), createClient()]);
  const templates = await listTemplates(supabase);
  const canEdit = can(ctx, 'settings.edit');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={t('documentTemplates.certificateTitle')}
        description={t('documentTemplates.certificateDescription')}
        actions={canEdit ? <NewTemplateButton templates={templates} defaultType="salary" /> : <span className="text-meta text-muted-foreground">{t('list.readOnly')}</span>}
      />
      <TemplatesManager templates={templates} canEdit={canEdit} types={CERTIFICATE_ONLY} />
    </div>
  );
}
