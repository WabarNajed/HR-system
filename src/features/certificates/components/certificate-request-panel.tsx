import { AwardIcon, Building2Icon, ClockIcon, InfoIcon, XCircleIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { KeyValueGrid } from '@/components/shared/key-value-grid';
import { SectionCard } from '@/components/shared/section-card';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getSessionContext } from '@/lib/auth/session';
import { can, checkAccess, hasAny } from '@/lib/permissions';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { ISSUABLE_STATUSES, listIssuableTemplates, listRequestCertificates, loadCertificateRequest, type IssuableTemplate } from '../server/queries';
import { CertificateIssueForm } from './certificate-issue-form';
import { CompleteRequestButton } from './complete-request-button';
import { IssuedCertificateList } from './issued-certificate-list';

const CLOSED = new Set(['completed', 'rejected', 'cancelled']);

/**
 * Request-details panel for `certificate` requests (extension point — ARCHITECTURE §8), mapped in
 * `features/request-panels/index.tsx`. HR (certificates.create) issues the certificate here; the
 * employee sees and downloads it. Everything is read with the user's RLS client.
 */
export async function CertificateRequestPanel({ requestId, showSummary = false }: { requestId: string; showSummary?: boolean }) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const request = await loadCertificateRequest(supabase, requestId);
  if (!request) return null;

  const t = await getTranslations('certificates');
  const tEnums = await getTranslations('enums');
  const tStatus = await getTranslations('statuses');
  const hr = ctx.isHR;
  const canIssue = hr && can(ctx, 'certificates.create');
  const canRevoke = hr && hasAny(ctx, ['certificates.edit', 'certificates.create']);
  const canComplete = hr && hasAny(ctx, ['requests.edit', 'requests.approve', 'approvals.approve']);
  const issuable = (ISSUABLE_STATUSES as readonly string[]).includes(request.status);

  const [certificates, templates, compensation, organization] = await Promise.all([
    listRequestCertificates(supabase, request.id),
    canIssue && issuable ? listIssuableTemplates(supabase) : Promise.resolve<IssuableTemplate[]>([]),
    canIssue && issuable && (request.values.include_salary || request.values.include_allowances)
      ? supabase.from('employee_compensation').select('employee_id', { count: 'exact', head: true }).eq('employee_id', request.employee_id)
      : Promise.resolve({ count: 1 }),
    canIssue && issuable
      ? supabase.from('organizations').select('name_ar, name_en, legal_name_ar, legal_name_en').limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const org = organization.data as { name_ar: string | null; name_en: string | null; legal_name_ar: string | null; legal_name_en: string | null } | null;
  const orgNameMissing = Boolean(canIssue && issuable && !(org?.name_ar || org?.name_en || org?.legal_name_ar || org?.legal_name_en));
  const canOpenOrganization = checkAccess(ctx, ROUTE_ACCESS['/settings/organization']);
  const hasValid = certificates.some((c) => c.status === 'valid');

  const enumLabel = (group: string, value: string | null) => {
    if (!value) return null;
    const key = `${group}.${value}`;
    const te = tEnums as unknown as {
      has: (k: string) => boolean;
      (k: string): string;
    };
    return te.has(key) ? te(key) : value;
  };
  const yesNo = (v: boolean) => (v ? t('panel.yes') : t('panel.no'));
  const statusLabel = (tStatus as unknown as { has: (k: string) => boolean; (k: string): string }).has(`request.${request.status}`)
    ? (tStatus as unknown as (k: string) => string)(`request.${request.status}`)
    : request.status;

  return (
    <SectionCard
      title={t('panel.title')}
      description={canIssue ? t('panel.descriptionHr') : hasValid ? t('panel.employeeReady') : t('panel.descriptionEmployee')}
      icon={<AwardIcon />}
      actions={canComplete && !CLOSED.has(request.status) && issuable ? <CompleteRequestButton requestId={request.id} disabled={!hasValid} /> : null}
    >
      <div className="flex flex-col gap-4 pt-2">
        {showSummary ? (
          <KeyValueGrid
            columns={2}
            items={[
              {
                label: t('fields.type'),
                value: enumLabel('certificateType', request.subtype),
              },
              {
                label: t('fields.language'),
                value: enumLabel('certificateLanguage', request.values.language),
              },
              {
                label: t('fields.addressedTo'),
                value: request.values.addressed_to,
              },
              { label: t('fields.purpose'), value: request.values.purpose },
              {
                label: t('fields.includeSalary'),
                value: yesNo(request.values.include_salary),
                hidden: !['salary', 'salary_employment', 'custom'].includes(request.subtype ?? ''),
              },
              {
                label: t('fields.includeAllowances'),
                value: yesNo(request.values.include_allowances),
                hidden: !['salary', 'salary_employment', 'custom'].includes(request.subtype ?? ''),
              },
              {
                label: t('fields.comments'),
                value: request.values.comments,
                span: 'full',
                hidden: !request.values.comments,
              },
            ]}
          />
        ) : null}

        {certificates.length ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-meta font-semibold text-muted-foreground">{t('panel.issuedList')}</h3>
            <IssuedCertificateList certificates={certificates} canRevoke={canRevoke} showTemplate={false} />
          </div>
        ) : null}

        {orgNameMissing ? (
          <Alert variant="warning">
            <Building2Icon />
            <AlertTitle>{t('panel.orgMissingTitle')}</AlertTitle>
            <AlertDescription>{t('panel.orgMissing')}</AlertDescription>
            {canOpenOrganization ? (
              <AlertActions>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/organization">{t('panel.orgMissingAction')}</Link>
                </Button>
              </AlertActions>
            ) : null}
          </Alert>
        ) : null}

        {canIssue ? (
          issuable ? (
            <CertificateIssueForm
              request={{
                id: request.id,
                subtype: request.subtype,
                ...request.values,
              }}
              templates={templates}
              alreadyIssued={hasValid}
              salaryUnavailable={(compensation.count ?? 0) === 0}
            />
          ) : !CLOSED.has(request.status) ? (
            <Alert variant="info">
              <InfoIcon />
              <AlertDescription>{t('panel.cannotIssueStatus')}</AlertDescription>
            </Alert>
          ) : null
        ) : hr ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{t('panel.noPermission')}</AlertDescription>
          </Alert>
        ) : !hasValid ? (
          CLOSED.has(request.status) ? (
            <Alert>
              <XCircleIcon />
              <AlertTitle>{t('panel.employeeClosed')}</AlertTitle>
              <AlertDescription>{t('panel.requestClosed', { status: statusLabel })}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="info">
              <ClockIcon />
              <AlertDescription>{t('panel.employeeWaiting')}</AlertDescription>
            </Alert>
          )
        ) : null}
      </div>
    </SectionCard>
  );
}
