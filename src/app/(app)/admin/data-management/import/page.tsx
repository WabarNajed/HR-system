import type { Metadata } from 'next';
import { forbidden, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shared/page-header';
import { BreadcrumbLabel } from '@/components/shell/breadcrumb-context';
import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { ImportWizard, type WizardCaps, type WizardInitial } from '@/features/data-management/components/wizard/import-wizard';
import type { DbClient } from '@/features/data-management/lib/context';
import { loadImportSource } from '@/features/data-management/lib/store';
import { defaultImportOptions, IMPORT_TYPES, isImportType } from '@/features/data-management/lib/types';
import { allowedImportTypes, canImportType, canUpdateExisting, importCapabilities } from '@/features/data-management/permissions';
import { countSkippedRows, inspectWorkbook, loadImport } from '@/features/data-management/server/service';
import { requireAccess } from '@/lib/auth/guards';
import { pageMetadata } from '@/lib/metadata';
import { createClient } from '@/lib/supabase/server';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('dataManagement.wizard.title');

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Import wizard: type → upload → sheet & header → mapping → review & options → batched import. */
export default async function DataImportPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requireAccess(ROUTE_ACCESS['/admin/data-management']);
  const allowed = allowedImportTypes(ctx);
  if (!allowed.length) forbidden();
  const sp = await searchParams;
  const t = await getTranslations('dataManagement');
  const year = new Date().getFullYear();
  const capsBase = importCapabilities(ctx);
  const caps: WizardCaps = {
    allowed,
    canUpdate: Object.fromEntries(IMPORT_TYPES.map((x) => [x, canUpdateExisting(ctx, x)])),
    settingsEdit: capsBase.settingsEdit,
    leaveEdit: capsBase.leaveEdit,
  };

  const typeParam = typeof sp.type === 'string' && isImportType(sp.type) && allowed.includes(sp.type) ? sp.type : null;
  let initial: WizardInitial = {
    step: typeParam ? 'upload' : 'type',
    type: typeParam,
    group: sp.group === 'master' ? 'master' : null,
    importId: null,
    fileName: null,
    inspection: null,
    mapping: null,
    options: { ...defaultImportOptions(year), createMissingMasterData: capsBase.settingsEdit },
    validation: null,
    run: null,
    notice: null,
  };

  const id = typeof sp.id === 'string' ? sp.id : null;
  if (id) {
    const db = (await createClient({ timeoutMs: 30_000 })) as unknown as DbClient;
    const imp = await loadImport(db, id);
    if (!imp || imp.status === 'cancelled') redirect('/admin/data-management?tab=history');
    if (!canImportType(ctx, imp.type)) forbidden();
    const options = { ...initial.options, ...(imp.options ?? {}) };
    initial = { ...initial, type: imp.type, importId: imp.id, fileName: imp.fileName, options };
    if (imp.status === 'uploaded' || imp.status === 'validated') {
      const source = await loadImportSource(db, imp.id);
      if (!source) {
        initial = { ...initial, step: 'upload', importId: null, fileName: null, notice: 'dataManagement.errors.sourceExpired' };
      } else {
        const inspection = inspectWorkbook(source, imp.type, {
          sheetIndex: imp.mapping?.sheet_index ?? imp.summary.sheet_index,
          headerRow: imp.mapping?.header_row,
          headerRows: imp.mapping?.header_rows === 2 ? 2 : imp.mapping ? 1 : undefined,
        });
        initial = { ...initial, step: 'sheet', inspection };
        if (imp.status === 'validated' && imp.mapping) {
          const skipped = await countSkippedRows(db, imp.id);
          const actions = imp.summary.actions ?? { create: 0, update: 0, skip: 0 };
          initial = {
            ...initial,
            step: 'review',
            mapping: imp.mapping.columns,
            validation: {
              totals: { total: imp.totals.total, valid: imp.totals.valid, warning: imp.totals.warning, error: imp.totals.error, ...actions },
              skipped,
            },
          };
        }
      }
    } else {
      // importing (resume) · completed / failed (result)
      const r = imp.summary.result ?? null;
      const processed = r ? r.created + r.updated + r.skipped + r.failed : 0;
      const total = imp.totals.valid + imp.totals.warning;
      initial = {
        ...initial,
        step: 'run',
        run:
          imp.status === 'importing'
            ? { phase: 'running', done: processed, total, last: null, error: null }
            : {
                phase: 'done',
                done: total,
                total,
                error: null,
                last: {
                  processed: 0,
                  pending: 0,
                  imported: imp.totals.imported,
                  skipped: r?.skipped ?? 0,
                  failed: r?.failed ?? 0,
                  done: true,
                  status: imp.status,
                  result: r,
                },
              },
        validation: {
          totals: { total: imp.totals.total, valid: imp.totals.valid, warning: imp.totals.warning, error: imp.totals.error, create: 0, update: 0, skip: 0 },
          skipped: 0,
        },
      };
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <BreadcrumbLabel label={t('wizard.title')} />
      <PageHeader
        compact
        breadcrumbs={[{ label: t('title'), href: '/admin/data-management' }, { label: t('wizard.title') }]}
        title={t('wizard.title')}
        description={t('wizard.description')}
      />
      <ImportWizard key={initial.importId ?? initial.type ?? 'new'} initial={initial} caps={caps} />
    </div>
  );
}
