import 'server-only';

import type { ListParams } from '@/lib/list-params';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import type { DbClient } from '../lib/context';
import { isImportType } from '../lib/types';
import type { HubStats, ImportStatus, ImportView } from '../types';
import { profileNames, toImportView } from './service';

export const HISTORY_SORTS = ['created_at', 'file_name', 'import_type', 'total_rows', 'error_rows', 'status'] as const;
export const HISTORY_FILTERS = ['type', 'status', 'errors'] as const;
export const IMPORT_STATUSES: readonly ImportStatus[] = ['uploaded', 'validated', 'importing', 'completed', 'failed', 'cancelled'];

function db(client: ServerSupabaseClient): DbClient {
  return client as unknown as DbClient;
}

export async function getHubStats(client: ServerSupabaseClient): Promise<HubStats> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [recent, total, last] = await Promise.all([
    db(client).from('imports').select('imported_rows, error_rows').gte('created_at', since).neq('status', 'cancelled').limit(1000),
    db(client).from('imports').select('id', { count: 'exact', head: true }),
    db(client).from('imports').select('import_type, file_name, status, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const rows = recent.data ?? [];
  return {
    imports30: rows.length,
    importsTotal: total.count ?? 0,
    records30: rows.reduce((s, r) => s + (r.imported_rows ?? 0), 0),
    errors30: rows.reduce((s, r) => s + (r.error_rows ?? 0), 0),
    last: last.data && isImportType(last.data.import_type)
      ? { type: last.data.import_type, fileName: last.data.file_name, status: last.data.status as ImportStatus, createdAt: last.data.created_at }
      : null,
  };
}

export async function listImportHistory(
  client: ServerSupabaseClient,
  params: ListParams<(typeof HISTORY_SORTS)[number], (typeof HISTORY_FILTERS)[number]>,
): Promise<{ rows: ImportView[]; total: number }> {
  let query = db(client)
    .from('imports')
    .select(
      'id, import_type, file_name, status, created_at, completed_at, created_by, total_rows, valid_rows, warning_rows, error_rows, imported_rows, mapping, options, summary, updated_at',
      { count: 'exact' },
    );
  const types = (params.filters.type ?? []).filter(isImportType);
  if (types.length) query = query.in('import_type', types);
  const statuses = (params.filters.status ?? []).filter((s) => (IMPORT_STATUSES as readonly string[]).includes(s));
  if (statuses.length) query = query.in('status', statuses);
  if (params.filters.errors?.includes('1')) query = query.gt('error_rows', 0);
  if (params.q) {
    const q = params.q.replace(/[,()"'*%\\]/g, ' ').trim();
    if (q) query = query.ilike('file_name', `%${q}%`);
  }
  const sort = params.sort ?? 'created_at';
  query = query.order(sort, { ascending: params.dir === 'asc' });
  if (sort !== 'created_at') query = query.order('created_at', { ascending: false });
  const { data, error, count } = await query.range(params.from, params.to);
  if (error) throw error;
  const names = await profileNames(db(client), (data ?? []).map((r) => r.created_by));
  return { rows: (data ?? []).map((r) => toImportView(r, names)), total: count ?? 0 };
}
