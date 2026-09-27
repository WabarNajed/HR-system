'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ok, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { CATEGORY_TYPES, NOTIFICATION_CATEGORIES } from './categories';

/**
 * Notification read-state mutations. RLS (`notifications_update_own`) limits every update to the
 * caller's own rows and only `read_at` is updatable, so a forged id simply matches nothing.
 */

const idsSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) });

export const markNotificationsRead = withAction(
  idsSchema,
  async ({ ids }, { ctx }) => {
    const supabase = await createClient({ timeoutMs: 8000 });
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id)
      .in('id', ids)
      .is('read_at', null);
    if (error) throw error;
    revalidatePath('/notifications');
    return ok(undefined, 'notifications.toast.markedRead');
  },
  { scope: 'notifications.markRead' },
);

export const markNotificationsUnread = withAction(
  idsSchema,
  async ({ ids }, { ctx }) => {
    const supabase = await createClient({ timeoutMs: 8000 });
    const { error } = await supabase.from('notifications').update({ read_at: null }).eq('user_id', ctx.user.id).in('id', ids);
    if (error) throw error;
    revalidatePath('/notifications');
    return ok(undefined, 'notifications.toast.markedUnread');
  },
  { scope: 'notifications.markUnread' },
);

const allSchema = z.object({ category: z.enum(NOTIFICATION_CATEGORIES).nullish() });

/** Marks every unread notification (optionally of one category) as read; returns how many changed. */
export const markAllNotificationsRead = withAction(
  allSchema,
  async ({ category }, { ctx }) => {
    const supabase = await createClient({ timeoutMs: 8000 });
    let query = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id)
      .is('read_at', null);
    if (category) query = query.in('type', [...CATEGORY_TYPES[category]]);
    const { data, error } = await query.select('id');
    if (error) throw error;
    revalidatePath('/notifications');
    return ok({ count: data?.length ?? 0 }, 'notifications.toast.markedAllRead');
  },
  { scope: 'notifications.markAllRead' },
);
