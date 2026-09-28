import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { TemplateEditor } from '@/features/email-templates/components/template-editor';
import { getEmailTemplate, type EmailTemplateRow } from '@/features/email-templates/queries';
import { buildPreviewContext, type PreviewContext } from '@/features/email-templates/sample';
import { requireAccess } from '@/lib/auth/guards';
import { localized } from '@/lib/i18n/localized';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.emailTemplates');

type Loaded = { template: EmailTemplateRow | null; previews: { ar: PreviewContext; en: PreviewContext } };

/** Settings › Email templates › editor for one template key. */
export default async function EmailTemplateEditorPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/email-templates']);
  const { key } = await params;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(key)) notFound();
  const t = await getTranslations('emailTemplates');
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: Loaded;
  try {
    const [template, leaveType] = await Promise.all([
      getEmailTemplate(supabase, key),
      supabase.from('request_types').select('name_ar, name_en').eq('key', 'leave').maybeSingle(),
    ]);
    const typeName = leaveType.data ? { ar: leaveType.data.name_ar, en: leaveType.data.name_en } : null;
    const [ar, en] = await Promise.all([buildPreviewContext('ar', typeName), buildPreviewContext('en', typeName)]);
    data = { template, previews: { ar, en } };
  } catch (error) {
    console.error('[email-templates] editor load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} breadcrumbs={[{ label: t('title'), href: '/settings/email-templates' }]} />
        <ErrorState variant="card" />
      </div>
    );
  }
  if (!data.template) notFound();

  return (
    <>
      <BreadcrumbLabel label={localized(data.template, 'name', ctx.locale)} />
      <TemplateEditor template={data.template} previews={data.previews} canEdit={can(ctx, 'settings.edit')} userEmail={ctx.profile.email} />
    </>
  );
}
