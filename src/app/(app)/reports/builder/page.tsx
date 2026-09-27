import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { PageStack } from '@/components/shared/responsive-grid';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { requireAccess } from '@/lib/auth/guards';
import { getTranslator } from '@/lib/i18n/translator';
import { pageMetadata } from '@/lib/metadata';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { ActionError } from '@/lib/action';
import { ReportBuilder } from '@/features/reports/components/builder/report-builder';
import { validateBuilderConfig } from '@/features/reports/builder/server';
import {
  BUILDER_SOURCE_DEFS,
  canUseSource,
  decodeBuilderConfig,
  visibleFields,
  type BuilderConfig,
  type BuilderSourceKey,
  type ReferenceList,
} from '@/features/reports/builder/sources';
import { loadFilterOptions } from '@/features/reports/queries';
import type { FacetOption } from '@/features/reports/components/facet-filter';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('reports.builder.title');

const REFERENCE_FILTERS: Record<ReferenceList, 'department' | 'jobTitle' | 'location' | 'leaveType' | 'requestType'> = {
  departments: 'department',
  jobTitles: 'jobTitle',
  locations: 'location',
  leaveTypes: 'leaveType',
  requestTypes: 'requestType',
};

export default async function ReportsBuilderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/reports/builder']);
  const sp = await searchParams;
  const t = getTranslator(ctx.locale);

  const sources = BUILDER_SOURCE_DEFS.filter((s) => canUseSource(ctx, s));
  const fields = Object.fromEntries(
    sources.map((s) => {
      const visible = visibleFields(ctx, s).map((f) => f.key);
      return [s.key, { visible, restricted: s.fields.length - visible.length }];
    }),
  ) as Record<BuilderSourceKey, { visible: string[]; restricted: number }>;

  // A shared link restores its configuration when it is valid for this viewer.
  let initialConfig: BuilderConfig | null = null;
  const rawCfg = typeof sp.cfg === 'string' ? sp.cfg : null;
  if (rawCfg) {
    try {
      initialConfig = validateBuilderConfig(decodeBuilderConfig(rawCfg), ctx).config;
    } catch (error) {
      if (!(error instanceof ActionError)) throw error;
      initialConfig = null;
    }
  }

  // Option lists for reference filters used by the accessible sources.
  const refs = new Set<ReferenceList>();
  for (const s of sources) for (const f of s.fields) if (f.reference) refs.add(f.reference);
  const options = await loadFilterOptions(
    await createClient(),
    Array.from(refs).map((r) => REFERENCE_FILTERS[r]),
    ctx.locale,
  );
  const references = Object.fromEntries(
    Array.from(refs).map((r) => [
      r,
      (options[REFERENCE_FILTERS[r]] ?? []).map((o): FacetOption => ({ value: o.value, label: o.inactive ? `${o.label} · ${t('reports.filters.inactive')}` : o.label })),
    ]),
  ) as Partial<Record<ReferenceList, FacetOption[]>>;

  return (
    <PageStack>
      <PageHeader title={t('reports.builder.title')} description={t('reports.builder.description')} />
      <ReportBuilder
        sources={sources.map((s) => s.key)}
        fields={fields}
        initialConfig={initialConfig}
        references={references}
        canExport={can(ctx, 'reports.export')}
      />
    </PageStack>
  );
}
