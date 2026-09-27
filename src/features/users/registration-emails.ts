import 'server-only';

import { deliverEmailsForNotifications } from '@/lib/notifications';
import { createAdminClient, isAdminClientConfigured } from '@/lib/supabase/admin';

/**
 * E-mails the registration notifications that the database created for one applicant profile
 * (`registration_submitted` → reviewers, `registration_approved|rejected|info_requested` → applicant).
 *
 * The registration RPCs/triggers return no notification ids and their rows are only readable by the
 * recipients, so the ids are looked up with the service role — strictly scoped to this profile, the
 * given types, not yet e-mailed, created in the last minutes — and handed to
 * `deliverEmailsForNotifications` (claim → template → send → `log_email`, idempotent).
 * Call after the triggering mutation succeeded (ideally inside `after()`). Never throws.
 */
export async function deliverRegistrationEmails(profileId: string, types: readonly string[]): Promise<void> {
  if (!isAdminClientConfigured() || !types.length) return;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notifications')
      .select('id')
      .eq('entity_type', 'profile')
      .eq('entity_id', profileId)
      .in('type', types as string[])
      .is('emailed_at', null)
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString());
    if (error) throw error;
    const ids = (data ?? []).map((n) => n.id);
    if (ids.length) await deliverEmailsForNotifications(ids, { asService: true });
  } catch (error) {
    console.error('[users] registration e-mail delivery failed:', error instanceof Error ? error.message : error);
  }
}
