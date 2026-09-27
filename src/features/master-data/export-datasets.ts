import 'server-only';

import { intlLocale } from '@/lib/i18n/config';
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

const SORTS = ['code', 'name', 'employees', 'status', 'updated_at', 'parent', 'head', 'city'] as const;

/** ISO 3166 code (Settings › Locations picker) → localized name; free text from imports as is. */
function countryName(value: string | null, locale: 'ar' | 'en'): string {
  const v = value?.trim() ?? '';
  if (!/^[A-Za-z]{2}$/.test(v)) return v;
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: 'region' }).of(v.toUpperCase()) ?? v;
  } catch {
    return v;
  }
}

/** Same haystack as the page's client-side search (master-data-manager `searchText`). */
function matches(row: MasterDataRow, q: string, locale: 'ar' | 'en'): boolean {
  if (!q) return true;
  const hay = [
    row.code,
    row.name_ar,
    row.name_en,
    row.city,
    row.country,
    countryName(row.country, locale),
    row.parent?.name_ar,
    row.parent?.name_en,
    row.head?.name_ar,
    row.head?.name_en,
    row.head?.employee_number,
  ]
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
      case 'head':
        return r.head ? employeeDisplayName(r.head, locale) : '';
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
    cols.push(
      { key: 'city', header: t('masterData.fields.city'), width: 18 },
      { key: 'country', header: t('masterData.fields.country'), width: 22, value: (r) => countryName(r.country, t.locale) },
    );
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
    // Same filter keys as the page's client-side filters (status · head for departments · city for locations).
    filterKeys: ['status', 'head', 'city'],
    allowedSorts: SORTS,
    defaultSort: 'code',
    defaultDir: 'asc',
    landscape: config.hasHierarchy,
    columns: (t) => baseColumns(t, entity),
    fetchRows: async (supabase, params, ctx) => {
      const [raw, usage] = await Promise.all([fetchMasterRows(supabase, entity, ctx.limit), fetchMasterUsage(supabase, entity)]);
      const status = params.filters.status ?? [];
      const head = config.hasHierarchy ? (params.filters.head ?? []) : [];
      const city = config.hasPlace ? (params.filters.city ?? []) : [];
      const rows = raw
        .map((r) => toMasterRow(r, usage.get(r.id)))
        .filter((r) => matches(r, params.q, ctx.locale))
        .filter((r) => !status.length || status.includes(r.is_active ? 'active' : 'inactive'))
        .filter((r) => !head.length || head.includes(r.head_employee_id ? 'yes' : 'no'))
        .filter((r) => !city.length || (r.city !== null && city.includes(r.city)));
      return sortRows(rows, params, ctx.locale);
    },
    describeFilters: (params, t) => {
      const sep = t.locale === 'ar' ? '، ' : ', ';
      const out: string[] = [];
      const status = params.filters.status ?? [];
      if (status.length) out.push(`${t('common.status')}: ${status.map((s) => (s === 'active' ? t('common.active') : t('common.inactive'))).join(sep)}`);
      const head = config.hasHierarchy ? (params.filters.head ?? []) : [];
      if (head.length) out.push(`${t('masterData.columns.head')}: ${head.map((h) => (h === 'yes' ? t('masterData.filters.hasHead') : t('masterData.filters.noHead'))).join(sep)}`);
      const city = config.hasPlace ? (params.filters.city ?? []) : [];
      if (city.length) out.push(`${t('masterData.fields.city')}: ${city.join(sep)}`);
      return out;
    },
  });
}

export const datasets: AnyExportDataset[] = [dataset('departments'), dataset('job_titles'), dataset('locations'), dataset('cost_centers')];
