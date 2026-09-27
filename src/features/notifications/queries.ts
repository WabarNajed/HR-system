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

  const head = { count: 'exact' as const, head: true };
  const categoryCounts = NOTIFICATION_CATEGORIES.flatMap((c) => [
    supabase.from('notifications').select('id', head).in('type', [...CATEGORY_TYPES[c]]),
    supabase.from('notifications').select('id', head).in('type', [...CATEGORY_TYPES[c]]).is('read_at', null),
  ]);

  const [listRes, allRes, unreadRes, ...catRes] = await Promise.all([
    list.range(from, from + q.pageSize - 1),
    supabase.from('notifications').select('id', head),
    supabase.from('notifications').select('id', head).is('read_at', null),
    ...categoryCounts,
  ]);
  for (const r of [listRes, allRes, unreadRes, ...catRes]) if (r.error) throw r.error;

  const byCategory = Object.fromEntries(
    NOTIFICATION_CATEGORIES.map((c, i) => [c, { total: catRes[i * 2]!.count ?? 0, unread: catRes[i * 2 + 1]!.count ?? 0 }]),
  ) as NotificationsPageData['counts']['byCategory'];

  return {
    items: (listRes.data ?? []) as NotificationRecord[],
    total: listRes.count ?? 0,
    counts: { all: allRes.count ?? 0, unread: unreadRes.count ?? 0, byCategory },
  };
}
