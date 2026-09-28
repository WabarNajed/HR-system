import { AlertTriangleIcon, FilePenLineIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense, type ReactNode } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { EmployeeCell } from '@/components/shared/employee-cell';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { SplitLayout } from '@/components/shared/responsive-grid';
import { StatusBadge } from '@/components/shared/status-badge';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RequestTypePanel } from '@/features/request-panels';
import {
  RequestActionsPanel,
  RequestAttachmentsCard,
  RequestComments,
  RequestHistory,
  WorkflowProgress,
} from '@/features/requests/components/request-details';
import { RequestEditForm } from '@/features/requests/components/request-edit-form';
import { RequestFormRenderer } from '@/features/requests/components/request-form-renderer';
import { RequestSlaBadge, StepLabel, TypeIcon } from '@/features/requests/components/request-bits';
import { subtypeLabel } from '@/features/requests/labels';
import { getRequestDetail, loadFormLookups } from '@/features/requests/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatDate, formatDateTime } from '@/lib/dates';
import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import { createClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('requests');
  try {
    const supabase = await createClient();
    const { data } = await supabase.from('hr_requests').select('request_number').eq('id', id).maybeSingle();
    return { title: data?.request_number ?? t('title') };
  } catch {
    return { title: t('title') };
  }
}

/** Request details: header, data (read or edit & resubmit), type panel, attachments, comments, workflow, actions, timeline. */
export default async function RequestDetailsPage({ params, searchParams }: Props) {
  const ctx = await requireAccess(ROUTE_ACCESS['/requests/[id]']);
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations('requests');
  const supabase = await createClient();
  const detail = await getRequestDetail(supabase, id, ctx.user.id, ctx.locale);
  if (!detail) notFound();

  const { row, capabilities: caps, typeDef } = detail;
  const locale = ctx.locale;
  const typeName = typeDef ? localized(typeDef, 'name', locale) : t('unknownType');
  const sub = subtypeLabel(row, locale);
  const editing = sp.edit === '1' && caps.can_edit && (row.status === 'returned' || row.status === 'draft');
  const editLookups = editing ? await loadFormLookups(supabase, row.employee_id) : null;
  const employeeName = detail.employee ? employeeDisplayName(detail.employee, locale) : null;
  const summary = [typeName, employeeName].filter(Boolean).join(' · ');
  const fieldLabels = Object.fromEntries(detail.fields.map((f) => [f.key, localized(f, 'label', locale)]));
  const daysValue = typeof detail.values.days === 'number' ? detail.values.days : null;
  const hasAttachmentField = detail.fields.some((f) => f.field_type === 'attachment' && f.is_active !== false);
  const onBehalf = detail.filedOnBehalf && detail.requesterName;

  const hasActions =
    caps.can_approve ||
    caps.can_reject ||
    caps.can_return ||
    caps.can_start ||
    caps.can_complete ||
    caps.can_reassign ||
    caps.can_delete ||
    (caps.can_edit && !editing) ||
    (caps.can_cancel && row.status !== 'draft');
  const workflow = (
    <WorkflowProgress
      steps={detail.workflow}
      status={row.status}
      submittedAt={row.submitted_at}
      completedAt={row.completed_at}
      requesterName={detail.requesterName ?? (detail.employee ? employeeDisplayName(detail.employee, locale) : null)}
      assigneeName={row.assignee_name}
    />
  );
  const actions = (compact: boolean) => (
    <RequestActionsPanel requestId={row.id} number={row.request_number} summary={summary} status={row.status} caps={caps} compact={compact} editing={editing} />
  );

  return (
    <div className="flex flex-col gap-5">
      <BreadcrumbLabel label={row.request_number ?? t('draftNumber')} />
      <PageHeader
        compact
        leading={<TypeIcon icon={typeDef?.icon ?? row.type?.icon} color={typeDef?.color ?? row.type?.color} size="lg" />}
        title={typeName}
        titleAddon={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge domain="request" status={row.status} size="lg" />
            {detail.priority === 'high' || detail.priority === 'urgent' ? (
              <Badge variant={detail.priority === 'urgent' ? 'danger' : 'warning'} size="lg">
                {t(`priority.${detail.priority}`)}
              </Badge>
            ) : null}
          </div>
        }
        description={
          // Phones stack the parts (no separator dot left dangling at a line start).
          <span className="flex flex-col items-start gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
            {row.request_number ? (
              <span className="inline-flex items-center gap-1">
                <bdi className="font-medium text-foreground numeric">{row.request_number}</bdi>
                <CopyButton value={row.request_number} size="icon-xs" />
              </span>
            ) : (
              <span className="font-medium text-foreground">{t('draftNumber')}</span>
            )}
            {sub ? (
              <>
                <span aria-hidden className="max-sm:hidden">
                  ·
                </span>
                <span>{sub}</span>
              </>
            ) : null}
            <span aria-hidden className="max-sm:hidden">
              ·
            </span>
            <span>{t('details.createdOn', { date: formatDateTime(row.created_at, locale) })}</span>
          </span>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-card md:grid-cols-3 xl:grid-cols-6">
        <SummaryCell label={t('details.employee')} className="col-span-2 md:col-span-3 xl:col-span-2">
          {detail.employee ? (
            <EmployeeCell
              employee={{ ...detail.employee, avatarUrl: detail.employee.avatar_url }}
              href={ctx.isHR || ctx.isManager ? `/employees/${detail.employee.id}` : undefined}
              subtitle={[
                detail.employee.employee_number,
                detail.employee.job_title ? localized(detail.employee.job_title, 'name', locale) : null,
                detail.employee.department ? localized(detail.employee.department, 'name', locale) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : (
            <span className="text-faint-foreground">—</span>
          )}
        </SummaryCell>
        <SummaryCell label={t('details.submitted')}>
          <span className="numeric">{row.submitted_at ? formatDateTime(row.submitted_at, locale) : t('details.notSubmitted')}</span>
        </SummaryCell>
        <SummaryCell label={t('details.sla')}>
          <RequestSlaBadge row={row} size="md" />
          {row.due_at ? <span className="mt-1 block text-xs text-muted-foreground numeric">{t('details.dueOn', { date: formatDate(row.due_at, locale) })}</span> : null}
        </SummaryCell>
        <SummaryCell label={t('details.currentStep')}>
          <StepLabel row={row} />
        </SummaryCell>
        <SummaryCell label={t('details.assigned')}>
          {row.assignee_name ? <span className="text-sm text-foreground">{row.assignee_name}</span> : <span className="text-meta text-faint-foreground">{t('unassigned')}</span>}
          {onBehalf ? <span className="mt-1 block text-xs text-muted-foreground">{t('details.filedBy', { name: detail.requesterName! })}</span> : null}
        </SummaryCell>
      </div>

      {row.status === 'returned' && detail.returnNote ? (
        <Alert variant="warning" className="border-warning/35">
          <AlertTriangleIcon />
          <AlertTitle>{caps.can_edit ? t('returned.titleRequester') : t('returned.title')}</AlertTitle>
          <AlertDescription>
            <p>
              {t('returned.by', {
                name: detail.returnNote.actor ?? '—',
                date: formatDateTime(detail.returnNote.at, locale),
              })}
            </p>
            {detail.returnNote.note ? (
              <p dir="auto" className="mt-1 rounded-md bg-card/70 px-3 py-2 text-start text-sm whitespace-pre-line text-foreground">
                {detail.returnNote.note}
              </p>
            ) : null}
          </AlertDescription>
          {caps.can_edit && !editing ? (
            <AlertActions>
              <Button asChild size="sm">
                <Link href={`/requests/${row.id}?edit=1`}>
                  <FilePenLineIcon />
                  {t('returned.editResubmit')}
                </Link>
              </Button>
            </AlertActions>
          ) : null}
        </Alert>
      ) : null}

      {hasActions ? <div className="lg:hidden">{actions(true)}</div> : null}

      <SplitLayout
        main={
          <>
            {editing && editLookups ? (
              <RequestEditForm
                requestId={row.id}
                typeId={typeDef?.id ?? row.type?.id ?? ''}
                employeeId={row.employee_id}
                status={row.status as 'returned' | 'draft'}
                fields={detail.fields}
                initialValues={detail.values}
                attachments={detail.attachments}
                lookups={editLookups}
                allowAttachments={typeDef?.allow_attachments ?? true}
              />
            ) : (
              <SectionCard title={t('details.dataTitle')}>
                <RequestFormRenderer
                  fields={detail.fields.filter((f) => f.field_type !== 'attachment')}
                  values={detail.values}
                  readOnly
                  context={{
                    lookups: detail.lookups,
                    computed: daysValue !== null ? { days: t('details.daysValue', { count: daysValue }) } : undefined,
                  }}
                />
              </SectionCard>
            )}

            {/* Phones: the workflow follows the request data instead of trailing the whole page. */}
            <div className="lg:hidden">{workflow}</div>

            <Suspense fallback={<Skeleton className="h-40 w-full rounded-lg" />}>
              <RequestTypePanel requestTypeKey={typeDef?.key ?? row.type?.key ?? ''} requestId={row.id} />
            </Suspense>

            {/* While editing, field-bound files live in the form; general files (types without an
                attachment field, e.g. certificates) stay here so the requester can still add them. */}
            {!editing || detail.attachments.some((a) => !a.fieldKey) || !hasAttachmentField ? (
              <RequestAttachmentsCard
                requestId={row.id}
                items={editing ? detail.attachments.filter((a) => !a.fieldKey) : detail.attachments}
                fieldLabels={fieldLabels}
                canAttach={caps.can_attach && (!editing || !hasAttachmentField)}
                allowAttachments={typeDef?.allow_attachments ?? true}
              />
            ) : null}

            <RequestComments
              requestId={row.id}
              comments={detail.comments}
              canComment={caps.can_comment}
              canInternal={caps.can_view_internal}
              currentUserId={ctx.user.id}
            />

            <RequestHistory entries={detail.history} />
          </>
        }
        side={
          <>
            <div className="max-lg:hidden">{actions(false)}</div>
            <div className="max-lg:hidden">{workflow}</div>
          </>
        }
      />
    </div>
  );
}

function SummaryCell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 bg-card px-4 py-3 ${className ?? ''}`}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
