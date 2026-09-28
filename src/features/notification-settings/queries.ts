import 'server-only';

import type { ServerSupabaseClient } from '@/lib/supabase/server';

export type NotificationSettingRow = {
  id: string;
  event_key: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  recipients: string[];
  updated_at: string;
};

export type TemplateLite = { key: string; name_ar: string; name_en: string; is_active: boolean };

export async function loadNotificationSettings(supabase: ServerSupabaseClient): Promise<{ rows: NotificationSettingRow[]; templates: TemplateLite[] }> {
  const [settings, templates] = await Promise.all([
    supabase.from('notification_settings').select('id, event_key, in_app_enabled, email_enabled, recipients, updated_at').order('event_key'),
    supabase.from('email_templates').select('key, name_ar, name_en, is_active'),
  ]);
  if (settings.error) throw settings.error;
  if (templates.error) throw templates.error;
  return {
    rows: (settings.data ?? []).map((r) => ({
      ...r,
      recipients: Array.isArray(r.recipients) ? r.recipients.filter((x): x is string => typeof x === 'string') : [],
    })),
    templates: templates.data ?? [],
  };
}
