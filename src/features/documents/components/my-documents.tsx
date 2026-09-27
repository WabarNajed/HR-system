import { AlertTriangleIcon, CalendarClockIcon, FileStackIcon, FileXIcon, InfoIcon, UserRoundXIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack, SplitLayout } from '@/components/shared/responsive-grid';
import { SectionCard } from '@/components/shared/section-card';
import { StatCard } from '@/components/shared/stat-card';
import { todayIso } from '@/lib/dates';
import { daysLeft } from '../constants';
import { listEmployeeDocuments, listEmployeeExpiryItems } from '../queries';
import type { DocumentAccess } from '../types';
import { DocumentDialogsProvider } from './document-dialogs';
import { DocumentsTable } from './documents-table';
import { ExpiryList } from './expiry-table';
import { UploadDocumentDialog } from './upload-document-dialog';

/** Self-service view (employees, managers): own documents, uploads to review, own expiry dates. */
export async function MyDocuments({ access }: { access: DocumentAccess }) {
  const t = await getTranslations('documents');
  const employeeId = access.ownEmployeeId;

  if (!employeeId) {
    return (
      <PageStack>
        <PageHeader title={t('myTitle')} description={t('myDescription')} />
        <EmptyState variant="card" icon={UserRoundXIcon} title={t('myTitle')} description={t('upload.notLinked')} />
      </PageStack>
    );
  }

  const today = todayIso();
  const [documents, expiryItems] = await Promise.all([listEmployeeDocuments(employeeId), listEmployeeExpiryItems(employeeId)]);
  const rows = documents.rows;
  const pending = rows.filter((d) => d.status === 'pending_review').length;
  const rejected = rows.filter((d) => d.status === 'rejected').length;
  const expiring = expiryItems.filter((i) => {
    const d = daysLeft(i.expiry_date, today);
    return d !== null && d >= 0 && d <= 30;
  }).length;
  const expired = expiryItems.filter((i) => {
    const d = daysLeft(i.expiry_date, today);
    return d !== null && d < 0;
  }).length;
  const upcoming = expiryItems.filter((i) => (daysLeft(i.expiry_date, today) ?? 9999) <= 365).slice(0, 12);

  return (
    <DocumentDialogsProvider permissions={{ access: { edit: false, approve: false, ownEmployeeId: employeeId } }} today={today}>
      <PageStack>
        <PageHeader title={t('myTitle')} description={t('myDescription')} actions={<UploadDocumentDialog employeeId={employeeId} />} />

        <KpiGrid count={4}>
          <StatCard
            label={t('kpi.myTotal')}
            value={rows.length}
            icon={FileStackIcon}
            tone="primary"
            hint={t('kpi.myTotalHint', { count: pending })}
          />
          <StatCard label={t('kpi.myExpiring')} value={expiring} icon={CalendarClockIcon} tone="warning" hint={t('kpi.myExpiringHint')} />
          <StatCard label={t('kpi.myExpired')} value={expired} icon={AlertTriangleIcon} tone="danger" hint={t('kpi.myExpiredHint')} />
          <StatCard label={t('kpi.myRejected')} value={rejected} icon={FileXIcon} tone="neutral" hint={t('kpi.myRejectedHint')} />
        </KpiGrid>

        <SplitLayout
          main={
            documents.error ? (
              <ErrorState />
            ) : (
              <DocumentsTable variant="own" rows={rows} emptyAction={<UploadDocumentDialog employeeId={employeeId} />} />
            )
          }
          side={
            <>
              <SectionCard title={t('my.expiryTitle')} description={t('my.expiryDescription')} icon={<CalendarClockIcon />} dense>
                <div className="pt-2">
                  <ExpiryList items={upcoming} today={today} emptyText={t('empty.myExpiryDescription')} />
                </div>
              </SectionCard>
              <SectionCard title={t('my.guideTitle')} icon={<InfoIcon />} dense>
                <ol className="flex list-decimal flex-col gap-2 ps-5 pt-2 text-meta text-muted-foreground marker:text-faint-foreground">
                  <li>{t('my.guide1')}</li>
                  <li>{t('my.guide2')}</li>
                  <li>{t('my.guide3')}</li>
                </ol>
              </SectionCard>
            </>
          }
        />
      </PageStack>
    </DocumentDialogsProvider>
  );
}
