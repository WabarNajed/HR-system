import 'server-only';

import type { NotificationRecord } from '@/components/shell/notification-visuals';
import type { ServerSupabaseClient } from '@/lib/supabase/server';
import { CATEGORY_TYPES, NOTIFICATION_CATEGORIES, type NotificationCategory } from './categories';

/** Notifications center reads (RLS: own rows only). */

export type NotificationsQuery = {
  tab: 'all' | 'unread';
  category: NotificationCategory | null;
  page: number;
  pageSize: number;
};

export type NotificationsPageData = {
  items: NotificationRecord[];
  total: number;
  counts: { all: number; unread: number; byCategory: Record<NotificationCategory, { total: number; unread: number }> };
};

export async function loadNotifications(supabase: ServerSupabaseClient, q: NotificationsQuery): Promise<NotificationsPageData> {
  const from = (q.page - 1) * q.pageSize;
  let list = supabase
    .from('notifications')
    .select('id, type, params, link, read_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });
  if (q.tab === 'unread') list = list.is('read_at', null);
  if (q.category) list = list.in('type', [...CATEGORY_TYPES[q.category]]);

  // One grouped read for the tab / category counts (RPC `notification_counts`, own rows only).
  const [listRes, countsRes] = await Promise.all([list.range(from, from + q.pageSize - 1), supabase.rpc('notification_counts')]);
  if (countsRes.error) throw countsRes.error;

  const byType = new Map<string, { total: number; unread: number }>();
  for (const r of countsRes.data ?? []) byType.set(r.type, { total: Number(r.total ?? 0), unread: Number(r.unread ?? 0) });
  const sum = (types: readonly string[]) =>
    types.reduce((acc, type) => {
      const c = byType.get(type);
      return c ? { total: acc.total + c.total, unread: acc.unread + c.unread } : acc;
    }, { total: 0, unread: 0 });
  const byCategory = Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, sum(CATEGORY_TYPES[c])])) as NotificationsPageData['counts']['byCategory'];
  const all = sum([...byType.keys()]);
  const counts = { all: all.total, unread: all.unread, byCategory };

  if (listRes.error) {
    // Offset past the last row (stale `?page=` after marking all read / filtering): PostgREST answers
    // 416 (PGRST103). Report the real total so the page can send the user to the last page.
    const scope = q.category ? byCategory[q.category] : all;
    const scopeTotal = q.tab === 'unread' ? scope.unread : scope.total;
    if (from > 0 && scopeTotal <= from) return { items: [], total: scopeTotal, counts };
    throw listRes.error;
  }

  return {
    items: (listRes.data ?? []) as NotificationRecord[],
    total: listRes.count ?? 0,
    counts,
  };
}
