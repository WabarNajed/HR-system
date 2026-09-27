import { HistoryIcon, LockIcon, ScrollTextIcon } from 'lucide-react';
import Link from 'next/link';
import { unstable_rethrow } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import type { TimelineTone } from '@/components/shared/timeline';
import { Button } from '@/components/ui/button';
import { getSessionContext, type SessionContext } from '@/lib/auth/session';
import { localized } from '@/lib/i18n/localized';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import type { AuditTranslator } from '../labels';
import type { AuditEventView } from '../types';
import { AUDIT_COLUMNS, getActorProfiles, type AuditRow } from '../queries';
import { toAuditView } from '../view';
import { AuditActivityTimeline, SelfActivityTimeline, type SelfActivityItem } from './activity-timeline';

const PAGE = 25;

const ACTION_TONES: Record<string, TimelineTone> = {
  create: 'neutral',
  update: 'info',
  submit: 'primary',
  resubmit: 'primary',
  approve: 'success',
  complete: 'success',
  reject: 'danger',
  return: 'warning',
  cancel: 'neutral',
  reassign: 'secondary',
  start: 'info',
  comment: 'neutral',
};

type HistoryRow = {
  id: string;
  action: string;
  to_status: string | null;
  created_at: string;
  request: {
    id: string;
    request_number: string | null;
    employee_id: string;
    request_type: { name_ar: string | null; name_en: string | null } | null;
  } | null;
};

type DocumentRow = { id: string; document_type: string; status: string; created_at: string };

type ActivityResult =
  | { kind: 'audit'; events: AuditEventView[]; total: number }
  | { kind: 'self'; items: SelfActivityItem[] }
  | { kind: 'error' };

type AuditT = Awaited<ReturnType<typeof getTranslations<'audit'>>>;

async function loadActivity(
  employeeId: string,
  canAudit: boolean,
  ctx: SessionContext,
  tr: AuditTranslator,
  t: AuditT,
): Promise<ActivityResult> {
  try {
    const supabase = await createClient({ timeoutMs: 8000 });

    if (canAudit) {
      const { data, error, count } = await supabase
        .from('audit_logs')
        .select(AUDIT_COLUMNS, { count: 'exact' })
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      const rows = (data ?? []) as AuditRow[];
      const actors = await getActorProfiles(
        supabase,
        rows.map((r) => r.actor_id).filter((v): v is string => Boolean(v)),
      );
      return { kind: 'audit', events: rows.map((r) => toAuditView(r, ctx, tr, actors)), total: count ?? rows.length };
    }

    // Self: own request history + own documents (RLS-scoped reads).
    const [history, documents] = await Promise.all([
      supabase
        .from('request_history')
        .select(
          'id, action, to_status, created_at, request:hr_requests!request_id!inner(id, request_number, employee_id, request_type:request_types!request_type_id(name_ar, name_en))',
        )
        .eq('request.employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('employee_documents')
        .select('id, document_type, status, created_at')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    if (history.error) throw history.error;
    if (documents.error) throw documents.error;

    const label = (key: string, fallback: string) => (tr.has(key) ? tr(key) : fallback);
    const items: SelfActivityItem[] = [
      ...((history.data ?? []) as unknown as HistoryRow[]).map<SelfActivityItem>((h) => {
        const action = label(`enums.requestAction.${h.action}`, h.action);
        const typeName = h.request?.request_type ? localized(h.request.request_type, 'name', ctx.locale) : '';
        const status = h.to_status ? label(`statuses.request.${h.to_status}`, h.to_status) : '';
        return {
          id: `h-${h.id}`,
          kind: 'request',
          title: t('activity.requestEvent', { action, number: h.request?.request_number ?? label('dashboard.rows.draft', '') }),
          description: [typeName, status].filter(Boolean).join(' · ') || null,
          time: h.created_at,
          tone: ACTION_TONES[h.action] ?? 'neutral',
          href: h.request ? `/requests/${h.request.id}` : null,
        };
      }),
      ...((documents.data ?? []) as DocumentRow[]).map<SelfActivityItem>((d) => ({
        id: `d-${d.id}`,
        kind: 'document',
        title: t('activity.documentUploaded'),
        description: [label(`enums.documentType.${d.document_type}`, d.document_type), label(`statuses.document.${d.status}`, d.status)].join(' · '),
        time: d.created_at,
        tone: d.status === 'rejected' ? 'danger' : d.status === 'pending_review' ? 'warning' : 'success',
        href: '/documents',
      })),
    ]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 25);
    return { kind: 'self', items };
  } catch (error) {
    unstable_rethrow(error);
    console.error('[audit] employee activity failed', error);
    return { kind: 'error' };
  }
}

/**
 * Employee profile "Activity" tab (extension point — ARCHITECTURE §8).
 *  - audit viewers (org `audit.view`): the employee's audit trail (employee row, sub-records,
 *    documents, requests, leave adjustments) with the audit details drawer;
 *  - the employee on their own profile: a reduced timeline of their request history and documents
 *    (rows RLS already lets them read — the audit log itself stays HR-only);
 *  - anyone else (e.g. a manager): an explanatory empty state.
 */
export async function EmployeeActivityTab({ employeeId }: { employeeId: string }) {
  const [ctx, t, tRoot] = await Promise.all([getSessionContext(), getTranslations('audit'), getTranslations()]);
  if (!ctx) return null;
  const canAudit = can(ctx, 'audit.view');
  const isSelf = ctx.employee?.id === employeeId;

  if (!canAudit && !isSelf) {
    return (
      <SectionCard title={t('activity.title')} icon={<HistoryIcon />}>
        <EmptyState icon={LockIcon} tone="neutral" title={t('activity.restrictedTitle')} description={t('activity.restrictedDescription')} />
      </SectionCard>
    );
  }

  const result = await loadActivity(employeeId, canAudit, ctx, tRoot as unknown as AuditTranslator, t);

  if (result.kind === 'error') {
    return (
      <SectionCard title={t('activity.title')} icon={<HistoryIcon />}>
        <EmptyState icon={HistoryIcon} tone="danger" title={t('activity.error')} />
      </SectionCard>
    );
  }

  if (result.kind === 'audit') {
    const auditHref = `/admin/audit-logs?employee=${employeeId}`;
    return (
      <SectionCard
        title={t('activity.title')}
        description={t('activity.description')}
        icon={<HistoryIcon />}
        actions={
          result.events.length ? (
            <Button asChild variant="outline" size="sm">
              <Link href={auditHref}>
                <ScrollTextIcon />
                {t('activity.viewAll')}
              </Link>
            </Button>
          ) : null
        }
        footer={
          result.total > result.events.length ? (
            <Button asChild variant="ghost" size="sm" className="-ms-2 text-primary hover:text-primary">
              <Link href={auditHref}>{t('activity.loadMore')}</Link>
            </Button>
          ) : undefined
        }
      >
        {result.events.length ? (
          <AuditActivityTimeline events={result.events} />
        ) : (
          <EmptyState icon={HistoryIcon} tone="neutral" title={t('activity.empty')} description={t('activity.emptyDescription')} />
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('activity.selfTitle')} description={t('activity.selfDescription')} icon={<HistoryIcon />}>
      {result.items.length ? (
        <SelfActivityTimeline items={result.items} />
      ) : (
        <EmptyState icon={HistoryIcon} tone="neutral" title={t('activity.selfEmpty')} description={t('activity.selfEmptyDescription')} />
      )}
    </SectionCard>
  );
}
