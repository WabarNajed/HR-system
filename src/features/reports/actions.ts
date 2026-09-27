'use server';

import { z } from 'zod';
import { ActionError, ok, withAction } from '@/lib/action';
import { employeeDisplayName } from '@/lib/i18n/localized';
import { toIlikePattern } from '@/lib/list-params';
import { createClient } from '@/lib/supabase/server';
import { BUILDER_LIMITS } from './builder/sources';
import { runBuilderQuery, validateBuilderConfig } from './builder/server';
import { canOpenReportCenter } from './filters';

/** Employee lookup for the report "Employee" filter (RLS: HR → everyone, manager → team). */
export const searchReportEmployees = withAction(
  z.object({ query: z.string().trim().max(100) }),
  async ({ query }, { ctx }) => {
    if (!canOpenReportCenter(ctx)) throw new ActionError('errors.forbidden');
    const supabase = await createClient();
    let q = supabase
      .from('employees')
      .select('id, name_ar, name_en, employee_number')
      .is('archived_at', null)
      .order(ctx.locale === 'ar' ? 'name_ar' : 'name_en')
      .limit(20);
    if (query) q = q.ilike('search_text', toIlikePattern(query.toLowerCase()));
    const { data, error } = await q;
    if (error) throw error;
    return ok(
      (data ?? []).map((e) => ({
        value: e.id,
        label: employeeDisplayName(e, ctx.locale),
        description: e.employee_number ?? undefined,
      })),
    );
  },
  { scope: 'reports.searchEmployees' },
);

export type BuilderPreview = {
  rows: Record<string, unknown>[];
  total: number;
};

/** Report builder preview: first rows + total count, with the same validation as the export. */
export const previewReportBuilder = withAction(
  z.object({ config: z.unknown() }),
  async ({ config }, { ctx }) => {
    if (!canOpenReportCenter(ctx)) throw new ActionError('errors.forbidden');
    const validated = validateBuilderConfig(config, ctx);
    const supabase = await createClient({ timeoutMs: 20_000 });
    const { rows, total } = await runBuilderQuery(supabase, validated, ctx.locale, { from: 0, to: BUILDER_LIMITS.previewRows - 1 }, true);
    return ok<BuilderPreview>({ rows, total: total ?? rows.length });
  },
  { scope: 'reports.builderPreview' },
);
