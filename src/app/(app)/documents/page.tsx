import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { getDocumentAccess } from '@/features/documents/access';
import { DocumentCenter } from '@/features/documents/components/document-center';
import { MyDocuments } from '@/features/documents/components/my-documents';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('documents.title');

/**
 * Document Center. HR (org-scope documents.view) gets the full center (KPIs, documents, expiry
 * monitor, missing documents, review queue); everyone else with documents.view gets their own
 * documents (managers never see their reports' documents — RLS).
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/documents']);
  const access = await getDocumentAccess(ctx);
  if (!access.view && !can(ctx, 'documents.view')) forbidden();
  if (access.view) return <DocumentCenter ctx={ctx} access={access} searchParams={await searchParams} />;
  return <MyDocuments access={access} />;
}
