import { AwardIcon, BanIcon, CalendarCheckIcon, FilePlus2Icon, HourglassIcon, ShieldCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid, PageStack } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { Button } from '@/components/ui/button';
import { CertificateRequestPanel } from '@/features/certificates/components/certificate-request-panel';
import { CertificateRequestsTable } from '@/features/certificates/components/certificate-requests-table';
import { IssuedCertificatesTable } from '@/features/certificates/components/issued-certificates-table';
import { RequestSheet } from '@/features/certificates/components/request-sheet';
import { TemplatesOverview } from '@/features/certificates/components/templates-overview';
import { EmployeeCell } from '@/components/shared/employee-cell';
import {
  certificateKpis,
  ISSUED_FILTER_KEYS,
  ISSUED_SORTS,
  listCertificateRequests,
  listIssuedCertificates,
  listTemplates,
  loadCertificateRequest,
  REQUEST_FILTER_KEYS,
  REQUEST_SORTS,
} from '@/features/certificates/server/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can, checkAccess, hasAny } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('certificates.title', 'certificates.description');

type Tab = 'requests' | 'issued' | 'templates';
type SearchParams = Record<string, string | string[] | undefined>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Certificate Center: requests queue, issued certificates, templates (HR); own certificates (employees). */
export default async function CertificatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/certificates']);
  const sp = await searchParams;
  const t = await getTranslations('certificates');
  const supabase = await createClient();

  const hrView = ctx.isHR && can(ctx, 'certificates.view');
  const canIssue = hrView && can(ctx, 'certificates.create');
  const canTemplates = hrView && checkAccess(ctx, ROUTE_ACCESS['/settings/document-templates']);
  const canRequest = can(ctx, 'requests.create') && Boolean(ctx.employee);
  const requestHref = canRequest ? '/requests/new?type=certificate' : null;

  const tabs: Tab[] = canTemplates ? ['requests', 'issued', 'templates'] : ['requests', 'issued'];
  const rawTab = one(sp.tab) as Tab | undefined;
  // Global search links certificates as `/certificates?q=CERT-…` (no tab) → open the Issued tab.
  const certificateSearch = /^\s*CERT-/i.test(one(sp.q) ?? '');
  const tab: Tab = rawTab && tabs.includes(rawTab) ? rawTab : hrView && !certificateSearch ? 'requests' : 'issued';
  const sheetRequest = one(sp.request);

  const kpisPromise = certificateKpis(supabase);
  const requestsPromise =
    tab === 'requests'
      ? listCertificateRequests(
          supabase,
          parseListParams(sp, { allowedSorts: REQUEST_SORTS, defaultSort: 'created_at', defaultDir: 'desc', filterKeys: REQUEST_FILTER_KEYS }),
        )
      : null;
  const issuedPromise =
    tab === 'issued'
      ? listIssuedCertificates(
          supabase,
          parseListParams(sp, { allowedSorts: ISSUED_SORTS, defaultSort: 'created_at', defaultDir: 'desc', filterKeys: ISSUED_FILTER_KEYS }),
        )
      : null;
  const templatesPromise = tab === 'templates' ? listTemplates(supabase) : null;
  const sheetPromise = sheetRequest && UUID_RE.test(sheetRequest) ? loadCertificateRequest(supabase, sheetRequest) : null;
  const [kpis, requests, issued, templates, sheet] = await Promise.all([kpisPromise, requestsPromise, issuedPromise, templatesPromise, sheetPromise]);

  const n = (v: number) => formatInteger(v, ctx.locale);

  return (
    <PageStack>
      <PageHeader
        title={t('title')}
        description={hrView ? t('description') : t('employeeDescription')}
        actions={
          <>
            {canTemplates ? (
              <Button asChild variant="outline">
                <Link href="/settings/document-templates">{t('manageTemplates')}</Link>
              </Button>
            ) : null}
            {canRequest ? (
              <Button asChild>
                <Link href="/requests/new?type=certificate">
                  <FilePlus2Icon />
                  {t('requestCertificate')}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <KpiGrid count={hrView ? 4 : 3}>
        {hrView ? (
          <>
            <StatCard label={t('kpi.awaiting')} value={n(kpis.pendingRequests)} icon={HourglassIcon} tone="warning" hint={t('kpi.awaitingHint')} href="/certificates?tab=requests&status=pending_hr_review,approved,in_progress" />
            <StatCard label={t('kpi.issuedThisMonth')} value={n(kpis.issuedThisMonth)} icon={CalendarCheckIcon} tone="primary" hint={t('kpi.issuedThisMonthHint')} href="/certificates?tab=issued" />
            <StatCard label={t('kpi.valid')} value={n(kpis.totalValid)} icon={ShieldCheckIcon} tone="success" hint={t('kpi.validHint')} href="/certificates?tab=issued&status=valid" />
            <StatCard label={t('kpi.revoked')} value={n(kpis.revoked)} icon={BanIcon} tone="danger" hint={t('kpi.revokedHint')} href="/certificates?tab=issued&status=revoked" />
          </>
        ) : (
          <>
            <StatCard label={t('kpi.myCertificates')} value={n(kpis.totalValid)} icon={AwardIcon} tone="primary" hint={t('kpi.myCertificatesHint')} href="/certificates?tab=issued" />
            <StatCard label={t('kpi.myOpenRequests')} value={n(kpis.pendingRequests)} icon={HourglassIcon} tone="warning" hint={t('kpi.myOpenRequestsHint')} href="/certificates?tab=requests" />
            <StatCard label={t('kpi.issuedThisMonth')} value={n(kpis.issuedThisMonth)} icon={CalendarCheckIcon} tone="success" hint={t('kpi.issuedThisMonthHint')} className="max-lg:hidden" />
          </>
        )}
      </KpiGrid>

      <div className="flex flex-col gap-4">
        <LinkTabs
          aria-label={t('title')}
          value={tab}
          items={tabs.map((value) => ({
            value,
            label: t(`tabs.${value}`),
            count: value === 'requests' && hrView ? kpis.pendingRequests : null,
          }))}
        />
        {tab === 'requests' && requests ? (
          <CertificateRequestsTable rows={requests.rows} total={requests.total} hrView={hrView} canIssue={canIssue} requestCertificateHref={requestHref} />
        ) : null}
        {tab === 'issued' && issued ? (
          <IssuedCertificatesTable
            rows={issued.rows}
            total={issued.total}
            hrView={hrView}
            canRevoke={hrView && hasAny(ctx, ['certificates.edit', 'certificates.create'])}
            canExport={hrView && can(ctx, 'certificates.export')}
            requestCertificateHref={requestHref}
          />
        ) : null}
        {tab === 'templates' && templates ? <TemplatesOverview templates={templates} /> : null}
      </div>

      {sheet ? (
        <RequestSheet
          requestId={sheet.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {t('sheet.title')}
              <bdi dir="ltr" className="numeric text-muted-foreground">
                {sheet.request_number}
              </bdi>
            </span>
          }
          subtitle={sheet.employee ? <SheetEmployee employee={sheet.employee} /> : null}
        >
          <CertificateRequestPanel requestId={sheet.id} showSummary />
        </RequestSheet>
      ) : null}
    </PageStack>
  );
}

function SheetEmployee({ employee }: { employee: { id: string; employee_number: string | null; name_ar: string | null; name_en: string | null } }) {
  return (
    <EmployeeCell
      employee={employee}
      size="sm"
      subtitle={employee.employee_number ? <bdi dir="ltr">{employee.employee_number}</bdi> : null}
      className="pt-1"
    />
  );
}
