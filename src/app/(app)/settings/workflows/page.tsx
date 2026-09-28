import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { PageHeader } from '@/components/shared/page-header';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { WorkflowBuilder } from '@/features/request-config/components/workflow-builder';
import { loadRequestTypeRows, loadRoleOptions, loadStepUsers } from '@/features/request-config/queries';
import type { RequestTypeRow, RoleOption, UserOption, WorkflowStep } from '@/features/request-config/types';
import { synthesizedSteps } from '@/features/request-config/workflow-logic';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient, type ServerSupabaseClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.workflows');

type Loaded = { rows: RequestTypeRow[]; roles: RoleOption[]; type: RequestTypeRow | null; steps: WorkflowStep[]; users: UserOption[] };

async function load(supabase: ServerSupabaseClient, requested: string | null): Promise<Loaded> {
  const [rows, roles] = await Promise.all([loadRequestTypeRows(supabase), loadRoleOptions(supabase)]);
  const type = rows.find((r) => r.key === requested) ?? rows.find((r) => r.is_active) ?? rows[0] ?? null;
  if (!type) return { rows, roles, type: null, steps: [], users: [] };
  const steps = type.steps.length ? type.steps : synthesizedSteps(type);
  const users = await loadStepUsers(
    supabase,
    steps.map((s) => s.approver_user_id).filter((id): id is string => Boolean(id)),
  );
  return { rows, roles, type, steps, users };
}

/** Settings › Requests › Approval workflows (`?type=<request type key>`). */
export default async function SettingsWorkflowsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/workflows']);
  const sp = await searchParams;
  const t = await getTranslations('requestConfig.workflows');
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: Loaded;
  try {
    data = await load(supabase, typeof sp.type === 'string' ? sp.type : null);
  } catch (error) {
    console.error('[request-config] workflows load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }

  const { rows, roles, type, steps, users } = data;
  if (!type) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <EmptyState variant="card" title={t('noTypesTitle')} description={t('noTypesDescription')} />
      </div>
    );
  }
  const kindLabel = { standard: t('kind.standard'), custom: t('kind.custom'), none: t('kind.standard') };
  return (
    <WorkflowBuilder
      key={`${type.id}:${JSON.stringify(steps)}`}
      types={rows.map((r) => ({
        id: r.id,
        key: r.key,
        name_ar: r.name_ar,
        name_en: r.name_en,
        icon: r.icon,
        color: r.color,
        is_active: r.is_active,
        meta: r.steps.length || null,
        badge: <span className={r.workflowKind === 'custom' ? 'font-medium text-secondary-soft-foreground' : undefined}>{kindLabel[r.workflowKind]}</span>,
      }))}
      type={{
        id: type.id,
        key: type.key,
        name_ar: type.name_ar,
        name_en: type.name_en,
        icon: type.icon,
        color: type.color,
        is_active: type.is_active,
        sla_business_days: type.sla_business_days,
        openRequests: type.usage.open,
        kind: type.workflowKind,
      }}
      initialSteps={steps}
      roles={roles}
      users={users}
      counts={{ standard: rows.filter((r) => r.workflowKind !== 'custom').length, custom: rows.filter((r) => r.workflowKind === 'custom').length }}
      canEdit={can(ctx, 'settings.edit')}
    />
  );
}
