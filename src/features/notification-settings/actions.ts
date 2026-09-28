'use server';

import { revalidatePath } from 'next/cache';
import { ActionError, ok, requirePermissionIn, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { saveNotificationSettingsSchema } from './schemas';

/**
 * Settings › Notifications: saves the changed event rows in one upsert (`settings.edit`; RLS
 * enforces the same). Each changed row is audited by the `notification_settings` trigger.
 */
export const saveNotificationSettings = withAction(
  saveNotificationSettingsSchema,
  async ({ rows }, { ctx }) => {
    requirePermissionIn(ctx, 'settings.edit');
    const supabase = await createClient();
    const keys = rows.map((r) => r.eventKey);
    const { data: existing, error: readError } = await supabase.from('notification_settings').select('event_key').in('event_key', keys);
    if (readError) throw readError;
    if ((existing ?? []).length !== new Set(keys).size) throw new ActionError('errors.notFound');
    const { error } = await supabase
      .from('notification_settings')
      .upsert(
        rows.map((r) => ({ event_key: r.eventKey, in_app_enabled: r.inApp, email_enabled: r.email })),
        { onConflict: 'event_key' },
      );
    if (error) throw error;
    revalidatePath('/settings/notifications');
    revalidatePath('/settings');
    return ok(undefined, 'emailTemplates.notifications.toast.saved');
  },
  { scope: 'notificationSettings.save' },
);
