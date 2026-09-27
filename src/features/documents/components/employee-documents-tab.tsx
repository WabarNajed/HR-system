import { CheckCircle2Icon, CircleDashedIcon, ClockIcon, LockIcon, ShieldCheckIcon, UploadIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionContext } from '@/lib/auth/session';
import { todayIso } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { getDocumentAccess } from '../access';
import { requiredDocumentTypes, type DocumentType } from '../constants';
import { listEmployeeDocuments, listEmployeeExpiryItems } from '../queries';
import { DocumentDialogsProvider } from './document-dialogs';
import { DocumentsTable } from './documents-table';
import { ExpiryList } from './expiry-table';
import { RequiredDocumentLabel } from './required-document-label';
import { UploadDocumentDialog } from './upload-document-dialog';

type RequirementState = 'onFile' | 'inReview' | 'missing';

/**
 * Employee profile → Documents tab (extension point — ARCHITECTURE §8):
 * documents of one employee + compliance summary (required documents, expiry dates) + upload.
 * HR (org documents.view) sees everything; the employee sees their own (non-confidential)
 * documents; anyone else (e.g. the manager) gets a restricted state — documents are never shown.
 */
export async function EmployeeDocumentsTab({ employeeId }: { employeeId: string }) {
  const t = await getTranslations('documents');
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const access = await getDocumentAccess(ctx);
  const own = Boolean(access.ownEmployeeId) && access.ownEmployeeId === employeeId;

  if (!access.view && !own) {
    return (
      <EmptyState
        variant="card"
        icon={LockIcon}
        tone="neutral"
        title={t('profileTab.restrictedTitle')}
        description={t('profileTab.restrictedDescription')}
      />
    );
  }

  const today = todayIso();
  const supabase = await createClient();
  const [documents, expiryItems, employeeRes] = await Promise.all([
    listEmployeeDocuments(employeeId, { includeArchived: access.view }),
    listEmployeeExpiryItems(employeeId),
    supabase.from('employees').select('id, id_type, nationality, archived_at').eq('id', employeeId).maybeSingle(),
  ]);
  const employee = employeeRes.data as { id: string; id_type: string | null; nationality: string | null; archived_at: string | null } | null;
  const canUpload = access.create || own;

  const required = employee ? requiredDocumentTypes(employee.id_type, employee.nationality) : [];
  const stateOf = (type: DocumentType): RequirementState => {
    const docs = documents.rows.filter((d) => d.document_type === type);
    if (docs.some((d) => d.status === 'valid' || d.status === 'expired')) return 'onFile';
    if (docs.some((d) => d.status === 'pending_review')) return 'inReview';
    return 'missing';
  };
  const requirements = required.map((type) => ({ type, state: stateOf(type) }));
  const upload = canUpload ? (
    <UploadDocumentDialog
      employeeId={employeeId}
      trigger={
        <Button size="sm">
          <UploadIcon />
          {t('actions.upload')}
        </Button>
      }
    />
  ) : null;

  return (
    <DocumentDialogsProvider
      permissions={{ access: { edit: access.edit, approve: access.approve, ownEmployeeId: access.ownEmployeeId } }}
      today={today}
    >
      <SplitLayout
        main={
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-section-title text-foreground">{t('profileTab.documentsTitle')}</h2>
                <span className="text-meta text-muted-foreground">{t('profileTab.documentsCount', { count: documents.total })}</span>
              </div>
              {upload}
            </div>
            {documents.error ? (
              <ErrorState />
            ) : (
              <DocumentsTable variant={access.view ? 'profile' : 'own'} rows={documents.rows} emptyAction={upload} />
            )}
          </div>
        }
        side={
          <SectionCard title={t('profileTab.complianceTitle')} description={t('profileTab.complianceDescription')} icon={<ShieldCheckIcon />} dense>
            <div className="flex flex-col gap-4 pt-2">
              {requirements.length ? (
                <div className="flex flex-col gap-2">
                  <h3 className="text-meta font-semibold text-muted-foreground">{t('profileTab.requiredTitle')}</h3>
                  <ul className="flex flex-col gap-1.5">
                    {requirements.map(({ type, state }) => (
                      <li key={type} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                          {state === 'onFile' ? (
                            <CheckCircle2Icon className="size-4 shrink-0 text-success" aria-hidden />
                          ) : state === 'inReview' ? (
                            <ClockIcon className="size-4 shrink-0 text-warning" aria-hidden />
                          ) : (
                            <CircleDashedIcon className="size-4 shrink-0 text-danger" aria-hidden />
                          )}
                          <RequiredDocumentLabel type={type} />
                        </span>
                        <Badge variant={state === 'onFile' ? 'success' : state === 'inReview' ? 'warning' : 'danger'} size="sm">
                          {state === 'onFile' ? t('profileTab.onFile') : state === 'inReview' ? t('profileTab.inReviewBadge') : t('profileTab.missingBadge')}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <h3 className="text-meta font-semibold text-muted-foreground">{t('profileTab.upcomingTitle')}</h3>
                <ExpiryList items={expiryItems.slice(0, 10)} today={today} emptyText={t('profileTab.noUpcoming')} />
              </div>
            </div>
          </SectionCard>
        }
      />
    </DocumentDialogsProvider>
  );
}
