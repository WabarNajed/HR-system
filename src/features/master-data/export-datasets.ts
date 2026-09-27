import 'server-only';

import { employeeDisplayName, localized } from '@/lib/i18n/localized';
import type { LooseTranslator } from '@/lib/i18n/translator';
import { defineDataset, type AnyExportDataset, type ExportColumn } from '@/lib/export/types';
import type { ListParams } from '@/lib/list-params';
import { MASTER_ENTITY_CONFIG, type MasterDataRow, type MasterEntity } from './config';
import { fetchMasterRows, fetchMasterUsage, toMasterRow } from './queries';

/**
 * Master data exports (`/api/export/departments|job-titles|locations|cost-centers`), registered in
 * `src/lib/export/registry.ts`. Same search (`q`), status filter and sort ids as the Settings pages.
 */

const SORTS = ['code', 'name', 'employees', 'status', 'updated_at', 'parent', 'city'] as const;

function matches(row: MasterDataRow, q: string): boolean {
  if (!q) return true;
  const hay = [row.code, row.name_ar, row.name_en, row.city, row.country, row.parent?.name_ar, row.parent?.name_en]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function sortRows(rows: MasterDataRow[], params: ListParams, locale: 'ar' | 'en'): MasterDataRow[] {
  const dir = params.dir === 'desc' ? -1 : 1;
  const key = params.sort ?? 'code';
  const collator = new Intl.Collator(locale === 'ar' ? 'ar' : 'en', { numeric: true, sensitivity: 'base' });
  const value = (r: MasterDataRow): string | number => {
    switch (key) {
      case 'employees':
        return r.employees;
      case 'status':
        return r.is_active ? 0 : 1;
      case 'updated_at':
        return r.updated_at;
      case 'name':
        return localized(r, 'name', locale);
      case 'parent':
        return r.parent ? localized(r.parent, 'name', locale) : '';
      case 'city':
        return r.city ?? '';
      default:
        return r.code ?? '';
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return collator.compare(String(va), String(vb)) * dir;
  });
}

function baseColumns(t: LooseTranslator, entity: MasterEntity): ExportColumn<MasterDataRow>[] {
  const config = MASTER_ENTITY_CONFIG[entity];
  const cols: ExportColumn<MasterDataRow>[] = [
    { key: 'code', header: t('common.code'), width: 14 },
    { key: 'name_ar', header: t('common.nameAr'), width: 30 },
    { key: 'name_en', header: t('common.nameEn'), width: 30 },
  ];
  if (config.hasHierarchy) {
    cols.push(
      { key: 'parent', header: t('masterData.fields.parent'), width: 28, value: (r) => (r.parent ? localized(r.parent, 'name', t.locale) : '') },
      {
        key: 'head',
        header: t('masterData.fields.head'),
        width: 28,
        value: (r) => (r.head ? employeeDisplayName(r.head, t.locale) : ''),
      },
    );
  }
  if (config.hasPlace) {
    cols.push({ key: 'city', header: t('masterData.fields.city'), width: 18 }, { key: 'country', header: t('masterData.fields.country'), width: 18 });
  }
  cols.push(
    { key: 'employees', header: t('masterData.columns.employees'), type: 'integer', width: 12 },
    { key: 'is_active', header: t('common.status'), width: 12, value: (r) => (r.is_active ? t('common.active') : t('common.inactive')) },
    { key: 'description_ar', header: t('common.descriptionAr'), width: 36 },
    { key: 'description_en', header: t('common.descriptionEn'), width: 36 },
    { key: 'updated_at', header: t('common.updatedAt'), type: 'datetime', width: 20 },
  );
  return cols;
}

function dataset(entity: MasterEntity): AnyExportDataset {
  const config = MASTER_ENTITY_CONFIG[entity];
  return defineDataset<MasterDataRow>({
    key: config.exportKey,
    permission: 'settings.export',
    titleKey: `masterData.entities.${config.key}.title`,
    filterKeys: ['status'],
    allowedSorts: SORTS,
    defaultSort: 'code',
    defaultDir: 'asc',
    landscape: config.hasHierarchy,
    columns: (t) => baseColumns(t, entity),
    fetchRows: async (supabase, params, ctx) => {
      const [raw, usage] = await Promise.all([fetchMasterRows(supabase, entity, ctx.limit), fetchMasterUsage(supabase, entity)]);
      const status = params.filters.status ?? [];
      const rows = raw
        .map((r) => toMasterRow(r, usage.get(r.id)))
        .filter((r) => matches(r, params.q))
        .filter((r) => !status.length || status.includes(r.is_active ? 'active' : 'inactive'));
      return sortRows(rows, params, ctx.locale);
    },
    describeFilters: (params, t) => {
      const status = params.filters.status ?? [];
      return status.length
        ? [`${t('common.status')}: ${status.map((s) => (s === 'active' ? t('common.active') : t('common.inactive'))).join('، ')}`]
        : [];
    },
  });
}

export const datasets: AnyExportDataset[] = [dataset('departments'), dataset('job_titles'), dataset('locations'), dataset('cost_centers')];
