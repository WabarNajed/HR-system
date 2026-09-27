import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { TemplateEditor } from '@/features/certificates/components/editor/template-editor';
import { getTemplateDetail } from '@/features/certificates/server/queries';
import { requireAccess } from '@/lib/auth/guards';
import { localized } from '@/lib/i18n/localized';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('templates.documentTemplates.title');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Template editor: settings · rich text (Arabic / English / letterhead) · variables; versions, preview, publish. */
export default async function DocumentTemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/document-templates']);
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const template = await getTemplateDetail(supabase, id);
  if (!template) notFound();

  return (
    <>
      <BreadcrumbLabel label={localized(template, 'name', ctx.locale)} />
      <TemplateEditor key={template.id} template={template} canEdit={can(ctx, 'settings.edit')} />
    </>
  );
}
