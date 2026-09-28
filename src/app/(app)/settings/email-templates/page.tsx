import { MailCheckIcon, MailIcon, MailXIcon, ServerIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ErrorState } from '@/components/shared/error-state';
import { LinkTabs } from '@/components/shared/link-tabs';
import { PageHeader } from '@/components/shared/page-header';
import { KpiGrid } from '@/components/shared/responsive-grid';
import { StatCard } from '@/components/shared/stat-card';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { EmailLogTable } from '@/features/email-templates/components/email-log-table';
import { EmailTemplatesList } from '@/features/email-templates/components/email-templates-list';
import { EMAIL_LOG_FILTER_KEYS, EMAIL_LOG_SORTS } from '@/features/email-templates/constants';
import { getEmailProviderStatus } from '@/features/email-templates/provider';
import { emailStats, listEmailLogs, listEmailTemplates, type EmailLogRow, type EmailStats, type EmailTemplateRow } from '@/features/email-templates/queries';
import { requireAccess } from '@/lib/auth/guards';
import { formatInteger } from '@/lib/format';
import { localized } from '@/lib/i18n/localized';
import { mergeSearchParams, pageCount, parseListParams } from '@/lib/list-params';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('nav.settings.items.emailTemplates');

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

type Loaded = { templates: EmailTemplateRow[]; stats: EmailStats; log: { rows: EmailLogRow[]; total: number } | null };

/** Settings › Communication › Email templates (`?tab=templates|log`). */
export default async function SettingsEmailTemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/settings/email-templates']);
  const sp = await searchParams;
  const tab = sp.tab === 'log' ? 'log' : 'templates';
  const t = await getTranslations('emailTemplates');
  const params = parseListParams(sp, {
    defaultSort: 'created_at',
    defaultDir: 'desc',
    allowedSorts: EMAIL_LOG_SORTS,
    filterKeys: EMAIL_LOG_FILTER_KEYS,
    defaultPageSize: 25,
  });
  const supabase = await createClient({ timeoutMs: 10000 });

  let data: Loaded;
  try {
    const [templates, stats, log] = await Promise.all([
      listEmailTemplates(supabase),
      emailStats(supabase, daysAgoIso(30)),
      tab === 'log' ? listEmailLogs(supabase, params) : Promise.resolve(null),
    ]);
    data = { templates, stats, log };
  } catch (error) {
    console.error('[email-templates] load failed', error);
    return (
      <div className="flex flex-col gap-5">
        <PageHeader compact title={t('title')} description={t('description')} />
        <ErrorState variant="card" />
      </div>
    );
  }

  const { templates, stats, log } = data;
  if (log && params.page > 1 && log.rows.length === 0 && log.total <= params.from) {
    const last = pageCount(log.total, params.pageSize);
    redirect(`/settings/email-templates?${mergeSearchParams(sp, { page: last > 1 ? last : null }).toString()}`);
  }
  const provider = getEmailProviderStatus();
  const n = (v: number) => formatInteger(v, ctx.locale);
  const active = templates.filter((x) => x.is_active).length;
  const templateNames = Object.fromEntries(templates.map((x) => [x.key, localized(x, 'name', ctx.locale)]));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        compact
        title={t('title')}
        description={t('description')}
        tabs={
          <LinkTabs
            aria-label={t('tabsLabel')}
            items={[
              { value: 'templates', label: t('tabs.templates'), count: templates.length },
              { value: 'log', label: t('tabs.log') },
            ]}
            value={tab}
          />
        }
      />
      <KpiGrid>
        <StatCard label={t('kpi.active')} value={`${n(active)} / ${n(templates.length)}`} icon={MailIcon} tone="primary" hint={t('kpi.activeHint')} />
        <StatCard label={t('kpi.sent')} value={n(stats.sent)} icon={MailCheckIcon} tone="success" hint={t('kpi.last30')} href="/settings/email-templates?tab=log&status=sent" />
        <StatCard
          label={t('kpi.failed')}
          value={n(stats.failed + stats.skipped)}
          icon={MailXIcon}
          tone={stats.failed ? 'danger' : 'neutral'}
          hint={t('kpi.failedHint', { failed: stats.failed, skipped: stats.skipped })}
          href="/settings/email-templates?tab=log&status=failed,skipped"
        />
        <StatCard
          label={t('kpi.provider')}
          value={provider.provider ? t(`provider.providers.${provider.provider}`) : t('provider.providers.none')}
          icon={ServerIcon}
          tone={provider.provider && provider.from ? 'info' : 'warning'}
          hint={provider.provider && provider.from ? t('kpi.providerReady') : t('kpi.providerMissing')}
          href="/settings/notifications"
        />
      </KpiGrid>
      {tab === 'log' && log ? (
        <EmailLogTable
          rows={log.rows}
          total={log.total}
          templateNames={templateNames}
          templateOptions={templates.map((x) => ({ value: x.key, label: templateNames[x.key] ?? x.key }))}
          nowIso={new Date().toISOString()}
        />
      ) : (
        <EmailTemplatesList
          rows={templates.map(({ id, key, name_ar, name_en, subject_ar, subject_en, is_active, updated_at }) => ({ id, key, name_ar, name_en, subject_ar, subject_en, is_active, updated_at }))}
          canEdit={can(ctx, 'settings.edit')}
        />
      )}
    </div>
  );
}
