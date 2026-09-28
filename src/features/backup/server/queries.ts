import 'server-only';

import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { backupTablesFor, type BackupGroup } from '../lib/entities';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

export type BackupCounts = { byGroup: Record<BackupGroup, number>; byTable: Record<string, number>; total: number };

/** Row counts of every table the actor's backup would contain (RLS applies). */
export async function getBackupCounts(client: ServerSupabaseClient, includeSensitive: boolean): Promise<BackupCounts> {
  const loose = client as unknown as LooseClient;
  const tables = backupTablesFor(includeSensitive);
  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count, error } = await loose.from(t.source ?? t.table).select('*', { count: 'exact', head: true });
      return { t, count: error ? 0 : ((count as number | null) ?? 0) };
    }),
  );
  const byGroup = { organization: 0, people: 0, structure: 0, leave: 0, requests: 0, certificates: 0, configuration: 0 } as Record<BackupGroup, number>;
  const byTable: Record<string, number> = {};
  let total = 0;
  for (const { t, count } of counts) {
    byGroup[t.group] += count;
    byTable[t.table] = count;
    total += count;
  }
  return { byGroup, byTable, total };
}

export type BackupHistoryRow = {
  id: number;
  at: string;
  by: string | null;
  tables: number | null;
  rows: number | null;
  sensitive: boolean;
  file: string | null;
};

/** Backup history = `backup.export` audit events (needs audit.view; otherwise empty). */
export async function getBackupHistory(client: ServerSupabaseClient, limit = 20): Promise<{ rows: BackupHistoryRow[]; total: number }> {
  const { data, error, count } = await client
    .from('audit_logs')
    .select('id, created_at, actor_email, entity_id, changes', { count: 'exact' })
    .eq('action', 'backup.export')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { rows: [], total: 0 };
  return {
    total: count ?? 0,
    rows: (data ?? []).map((r) => {
      const c = (r.changes ?? {}) as { tables?: number; rows?: number; sensitive?: boolean; file?: string };
      return {
        id: r.id,
        at: r.created_at,
        by: r.actor_email,
        tables: typeof c.tables === 'number' ? c.tables : null,
        rows: typeof c.rows === 'number' ? c.rows : null,
        sensitive: Boolean(c.sensitive),
        file: c.file ?? r.entity_id ?? null,
      };
    }),
  };
}

export type ResetHistoryRow = { at: string; by: string | null };

export async function getLastReset(client: ServerSupabaseClient): Promise<ResetHistoryRow | null> {
  const { data } = await client.from('audit_logs').select('created_at, actor_email').eq('action', 'organization.reset').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ? { at: data.created_at, by: data.actor_email } : null;
}
