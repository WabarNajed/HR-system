import 'server-only';

import { ROUTE_ACCESS } from '@/components/shell/nav-config';
import { countryOptions } from '@/features/settings/queries';
import { requireAccess } from '@/lib/auth/guards';
import { can, checkAccess } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { MASTER_ENTITY_CONFIG, type MasterEntity } from '../config';
import { listMasterData, masterDataKpis } from '../queries';
import { MasterDataManager } from './master-data-manager';
import type { DepartmentOption } from './master-data-sheet';

/** Server entry for `/settings/{departments|job-titles|locations|cost-centers}`. */
export async function MasterDataPage({ entity }: { entity: MasterEntity }) {
  const config = MASTER_ENTITY_CONFIG[entity];
  const ctx = await requireAccess(ROUTE_ACCESS[config.route]);
  const supabase = await createClient();

  const rows = await listMasterData(supabase, entity);
  const kpis = await masterDataKpis(supabase, entity, rows, ctx.isHR && can(ctx, 'employees.view'));
  const departments: DepartmentOption[] =
    entity === 'departments'
      ? rows.map((r) => ({ id: r.id, code: r.code, name_ar: r.name_ar, name_en: r.name_en, parent_id: r.parent_id, is_active: r.is_active }))
      : [];

  // Locations: ISO country picker + localized country names (built here so SSR and hydration agree).
  const countries = config.hasPlace ? countryOptions(ctx.locale) : [];

  const canEdit = can(ctx, 'settings.edit');
  const importAllowed = canEdit && checkAccess(ctx, ROUTE_ACCESS['/admin/data-management']);

  return (
    <MasterDataManager
      entity={entity}
      rows={rows}
      kpis={kpis}
      departments={departments}
      countries={countries}
      canEdit={canEdit}
      canExport={can(ctx, 'settings.export')}
      importHref={importAllowed ? `/admin/data-management?type=${config.importType}` : null}
    />
  );
}
