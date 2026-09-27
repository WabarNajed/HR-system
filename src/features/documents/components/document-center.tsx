import { AlertTriangleIcon, CalendarClockIcon, ClockIcon, FileCheck2Icon, FileWarningIcon, InfoIcon, InboxIcon } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import type { SessionContext } from '@/lib/auth/session';
import { formatDateTime, todayIso } from '@/lib/dates';
import type { Locale } from '@/lib/i18n/config';
import { parseListParams, type SearchParamsInput } from '@/lib/list-params';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import {
  DOCUMENT_LIST_FILTERS,
  DOCUMENT_LIST_SORTS,
  DOCUMENT_TABS,
  EXPIRY_LIST_FILTERS,
  EXPIRY_LIST_SORTS,
  GAP_LIST_FILTERS,
  GAP_LIST_SORTS,
  type DocumentTab,
} from '../constants';
import {
  getDocumentCenterStats,
  getLastExpiryRun,
  listDepartmentOptions,
  listDocumentGaps,
  listDocuments,
  listExpiryItems,
} from '../queries';
import type { DocumentAccess } from '../types';
import { DocumentDialogsProvider } from './document-dialogs';
import { DocumentsTable } from './documents-table';
import { ExpiryTable } from './expiry-table';
import { MissingDocumentsTable } from './missing-table';
import { RunExpiryCheckButton } from './run-expiry-check-button';
import { UploadDocumentDialog } from './upload-document-dialog';

function readParam(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

async function alertDays(): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('organization_settings').select('expiry_alert_days').maybeSingle();
  const days = ((data as { expiry_alert_days?: number[] | null } | null)?.expiry_alert_days ?? []).filter((d) => d >= 0);
  return Array.from(new Set(days)).sort((a, b) => b - a);
}

/** HR Document Center (org documents.view): KPIs + Documents / Expiry monitor / Missing / Review queue. */
export async function DocumentCenter({
  ctx,
  access,
  searchParams,
}: {
  ctx: SessionContext;
  access: DocumentAccess;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const t = await getTranslations('documents');
  const locale = (await getLocale()) as Locale;
  const today = todayIso();
  const rawTab = readParam(searchParams, 'tab');
  const tab: DocumentTab = (DOCUMENT_TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as DocumentTab) : 'documents';
  const sp = searchParams as SearchParamsInput;
  const canOpenEmployee = can(ctx, 'employees.view') && ctx.isHR;

  const [stats, departments, lastRun, days, content] = await Promise.all([
    getDocumentCenterStats(),
    listDepartmentOptions(),
    getLastExpiryRun(),
    alertDays(),
    (async () => {
      switch (tab) {
        case 'expiry': {
          const params = parseListParams(sp, { filterKeys: EXPIRY_LIST_FILTERS, allowedSorts: EXPIRY_LIST_SORTS, defaultSort: 'expiry_date', defaultDir: 'asc' });
          return { tab, result: await listExpiryItems(params, { locale }) } as const;
        }
        case 'missing': {
          const params = parseListParams(sp, { filterKeys: GAP_LIST_FILTERS, allowedSorts: GAP_LIST_SORTS, defaultSort: 'employee', defaultDir: 'asc' });
          return { tab, result: await listDocumentGaps(params, { locale }) } as const;
        }
        case 'review': {
          const params = parseListParams(sp, { filterKeys: ['type'], allowedSorts: DOCUMENT_LIST_SORTS, defaultSort: 'created_at', defaultDir: 'desc' });
          return { tab, result: await listDocuments(params, { locale, scope: 'review' }) } as const;
        }
        default: {
          const params = parseListParams(sp, { filterKeys: DOCUMENT_LIST_FILTERS, allowedSorts: DOCUMENT_LIST_SORTS, defaultSort: 'created_at', defaultDir: 'desc' });
          return { tab: 'documents' as const, result: await listDocuments(params, { locale }) };
        }
      }
    })(),
  ]);

  const tabs = [
    { value: 'documents', label: t('tabs.documents') },
    { value: 'expiry', label: t('tabs.expiry'), count: stats.expired + stats.expiringSoon || null },
    { value: 'missing', label: t('tabs.missing'), count: stats.missingEmployees || null },
    { value: 'review', label: t('tabs.review'), count: stats.pendingReview || null },
  ];

  const scheduleDays = (days.length ? days : [90, 60, 30, 14, 7]).join(locale === 'ar' ? '، ' : ', ');
  const lastRunText = lastRun
    ? `${t('expiry.lastRun', { time: formatDateTime(lastRun.created_at, locale) })} · ${t('expiry.lastRunAlerts', { count: lastRun.items_alerted })}`
    : t('expiry.neverRun');

  return (
    <DocumentDialogsProvider permissions={{ access: { edit: access.edit, approve: access.approve, ownEmployeeId: access.ownEmployeeId } }} today={today}>
      <PageStack>
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            <>
              {access.edit ? <RunExpiryCheckButton /> : null}
              {access.create ? <UploadDocumentDialog /> : null}
            </>
          }
        />

        {stats.error ? <ErrorState variant="inline" /> : null}

        <KpiGrid count={4}>
          <StatCard
            label={t('kpi.expiringSoon')}
            value={stats.expiringSoon}
            icon={CalendarClockIcon}
            tone="warning"
            hint={t('kpi.expiringSoonHint', { count: stats.expiringWeek })}
            href="/documents?tab=expiry&bucket=d7,d14,d30"
          />
          <StatCard
            label={t('kpi.expired')}
            value={stats.expired}
            icon={AlertTriangleIcon}
            tone="danger"
            hint={t('kpi.expiredHint')}
            href="/documents?tab=expiry&bucket=expired"
          />
          <StatCard
            label={t('kpi.missing')}
            value={stats.missingDocuments}
            icon={FileWarningIcon}
            tone="secondary"
            hint={t('kpi.missingHint', { count: stats.missingEmployees })}
            href="/documents?tab=missing"
          />
          <StatCard
            label={t('kpi.uploaded')}
            value={stats.uploadedTotal}
            icon={FileCheck2Icon}
            tone="primary"
            hint={t('kpi.uploadedHint', { count: stats.uploadedThisMonth })}
            href="/documents"
          />
        </KpiGrid>

        {stats.pendingReview > 0 && tab !== 'review' && access.approve ? (
          <Alert variant="warning">
            <InboxIcon />
            <AlertTitle>{t('review.bannerTitle', { count: stats.pendingReview })}</AlertTitle>
            <AlertDescription>{t('review.bannerDescription')}</AlertDescription>
            <AlertActions>
              <Button asChild size="sm" variant="outline">
                <Link href="/documents?tab=review">{t('review.openQueue')}</Link>
              </Button>
            </AlertActions>
          </Alert>
        ) : null}

        <section className="flex min-w-0 flex-col gap-4">
          <LinkTabs items={tabs} value={tab} aria-label={t('title')} />

          {tab === 'expiry' ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted-foreground">
              <ClockIcon className="size-4 shrink-0" aria-hidden />
              <span>{t('expiry.schedule', { days: scheduleDays })}</span>
              <span aria-hidden className="text-faint-foreground">
                ·
              </span>
              <span className="numeric">{lastRunText}</span>
            </p>
          ) : null}
          {tab === 'missing' ? (
            <p className="flex items-start gap-2 text-meta text-muted-foreground">
              <SimpleTooltip content={t('missing.rule')}>
                <InfoIcon className="mt-0.5 size-4 shrink-0 text-info" aria-label={t('missing.ruleTitle')} tabIndex={0} />
              </SimpleTooltip>
              <span>{t('missing.rule')}</span>
            </p>
          ) : null}

          {content.result.error ? (
            <ErrorState />
          ) : content.tab === 'expiry' ? (
            <ExpiryTable
              rows={content.result.rows}
              total={content.result.total}
              today={today}
              departments={departments}
              exportEnabled={access.export}
              canOpenEmployee={canOpenEmployee}
            />
          ) : content.tab === 'missing' ? (
            <MissingDocumentsTable
              rows={content.result.rows}
              total={content.result.total}
              departments={departments}
              canUpload={access.create}
              canOpenEmployee={canOpenEmployee}
            />
          ) : content.tab === 'review' ? (
            <DocumentsTable variant="review" rows={content.result.rows} total={content.result.total} />
          ) : (
            <DocumentsTable
              variant="center"
              rows={content.result.rows}
              total={content.result.total}
              departments={departments}
              exportEnabled={access.export}
              emptyAction={access.create ? <UploadDocumentDialog /> : undefined}
            />
          )}
        </section>
      </PageStack>
    </DocumentDialogsProvider>
  );
}
