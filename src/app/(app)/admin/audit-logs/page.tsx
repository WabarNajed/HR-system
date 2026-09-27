import { ActivityIcon, KeyRoundIcon, PencilLineIcon, UserRoundSearchIcon, UsersRoundIcon } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { AuditLogTable, type AuditFilterOptions } from '@/features/audit/components/audit-log-table';
import {
  AUDIT_CATEGORIES,
  auditActionLabel,
  auditCategory,
  auditCategoryLabel,
  auditEntityLabel,
  splitAction,
  type AuditTranslator,
} from '@/features/audit/labels';
import {
  AUDIT_FILTER_KEYS,
  AUDIT_SORTS,
  getActorProfiles,
  getAuditEvent,
  getAuditFacets,
  listAuditLogs,
  type AuditFacet,
} from '@/features/audit/queries';
import { toAuditView } from '@/features/audit/view';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { mergeSearchParams, parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('audit.title');

/** ISO timestamp `hours` ago (module-level helper — keeps render pure). */
function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

const CHANGE_VERBS = new Set(['create', 'update', 'delete', 'archive', 'restore']);

function kpis(facets24h: AuditFacet[]) {
  const actions = facets24h.filter((f) => f.facet === 'action');
  const total = actions.reduce((s, f) => s + f.total, 0);
  const logins = actions.filter((f) => f.value === 'auth.login').reduce((s, f) => s + f.total, 0);
  const changes = actions.filter((f) => CHANGE_VERBS.has(splitAction(f.value).verb)).reduce((s, f) => s + f.total, 0);
  const actors = facets24h.filter((f) => f.facet === 'actor').length;
  return { total, logins, changes, actors };
}

/** Audit log (read-only; `audit.view`). */
export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/admin/audit-logs']);
  const sp = await searchParams;
  const [t, tRoot] = await Promise.all([getTranslations('audit'), getTranslations()]);
  const ta = tRoot as unknown as AuditTranslator;
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    defaultDir: 'desc',
    allowedSorts: AUDIT_SORTS,
    filterKeys: AUDIT_FILTER_KEYS,
    defaultPageSize: 25,
  });
  const eventParam = typeof sp.event === 'string' && /^\d{1,18}$/.test(sp.event) ? Number(sp.event) : null;
  const nowIso = new Date().toISOString();

  const supabase = await createClient({ timeoutMs: 10000 });
  let data;
  try {
    const since = hoursAgoIso(24);
    const employeeFilter = params.filters.employee?.[0] ?? null;
    const [list, facets, facets24h, event, scopedEmployee] = await Promise.all([
      listAuditLogs(supabase, params),
      getAuditFacets(supabase),
      getAuditFacets(supabase, since),
      eventParam ? getAuditEvent(supabase, eventParam) : Promise.resolve(null),
      employeeFilter && /^[0-9a-f-]{36}$/i.test(employeeFilter)
        ? supabase.from('employees').select('id, name_ar, name_en, employee_number').eq('id', employeeFilter).maybeSingle().then((r) => r.data)
        : Promise.resolve(null),
    ]);
    const actorIds = [...list.rows.map((r) => r.actor_id), event?.actor_id, ...facets.filter((f) => f.facet === 'actor').map((f) => f.value)].filter(
      (v): v is string => Boolean(v),
    );
    const actors = await getActorProfiles(supabase, actorIds);
    data = { list, facets, facets24h, event, actors, scopedEmployee };
  } catch (error) {
    console.error('[audit] load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t('title')} description={t('description')} />
        <ErrorState variant="page" />
      </div>
    );
  }

  const { list, facets, facets24h, event, actors, scopedEmployee } = data;
  const rows = list.rows.map((r) => toAuditView(r, ctx, ta, actors));
  const initialEvent = event ? (rows.find((r) => r.id === Number(event.id)) ?? toAuditView(event, ctx, ta, actors)) : null;

  // Filter options with counts (whole log).
  const actionFacets = facets.filter((f) => f.facet === 'action');
  const categoryCounts = new Map<string, number>();
  for (const f of actionFacets) {
    const c = auditCategory(f.value);
    if (c) categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + f.total);
  }
  const options: AuditFilterOptions = {
    categories: AUDIT_CATEGORIES.filter((c) => categoryCounts.has(c)).map((c) => ({
      value: c,
      label: auditCategoryLabel(ta, c),
      count: categoryCounts.get(c),
    })),
    actions: actionFacets
      .map((f) => ({ value: f.value, label: auditActionLabel(ta, f.value), count: f.total }))
      .sort((a, b) => a.label.localeCompare(b.label, ctx.locale)),
    entities: facets
      .filter((f) => f.facet === 'entity_type')
      .map((f) => ({ value: f.value, label: auditEntityLabel(ta, f.value), count: f.total }))
      .sort((a, b) => a.label.localeCompare(b.label, ctx.locale)),
    actors: [
      ...facets
        .filter((f) => f.facet === 'actor')
        .map((f) => {
          const p = actors.get(f.value);
          const name = p ? employeeDisplayName(p.employee, ctx.locale) || p.full_name : null;
          return { value: f.value, label: name || f.label || f.value, count: f.total };
        })
        .sort((a, b) => b.count - a.count),
      { value: 'system', label: t('system') },
    ],
  };

  const k = kpis(facets24h);
  const n = (v: number) => formatInteger(v, ctx.locale);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title={t('title')} description={t('description')} />
      <KpiGrid>
        <StatCard label={t('kpi.events')} value={n(k.total)} icon={ActivityIcon} tone="primary" hint={t('kpi.last24h')} />
        <StatCard label={t('kpi.logins')} value={n(k.logins)} icon={KeyRoundIcon} tone="info" hint={t('kpi.last24h')} />
        <StatCard label={t('kpi.changes')} value={n(k.changes)} icon={PencilLineIcon} tone="secondary" hint={t('kpi.changesHint')} />
        <StatCard label={t('kpi.actors')} value={n(k.actors)} icon={UsersRoundIcon} tone="success" hint={t('kpi.last24h')} />
      </KpiGrid>
      {scopedEmployee ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary-soft/50 px-4 py-2.5 text-sm">
          <span className="flex min-w-0 items-center gap-2 text-foreground">
            <UserRoundSearchIcon className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              {t('filters.employeeScope', { name: employeeDisplayName(scopedEmployee, ctx.locale) || scopedEmployee.employee_number || '' })}
            </span>
          </span>
          <Link href={`/admin/audit-logs?${new URLSearchParams(mergeSearchParams(sp, { employee: null, event: null })).toString()}`} className="text-meta font-medium text-primary hover:underline">
            {t('filters.clearEmployee')}
          </Link>
        </div>
      ) : null}
      <AuditLogTable
        rows={rows}
        total={list.total}
        options={options}
        initialEvent={initialEvent}
        canExport={can(ctx, 'audit.export')}
        nowIso={nowIso}
      />
    </div>
  );
}
