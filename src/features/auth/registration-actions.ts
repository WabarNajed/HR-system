'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { deliverRegistrationEmails } from '@/features/users/registration-emails';
import { ActionError, ok, withAction } from '@/lib/action';
import { createClient } from '@/lib/supabase/server';
import { registrationDetailsSchema } from './schemas';

/**
 * Applicant answers HR's information request from /pending-approval. Self-updates of the
 * registration fields are allowed by the column grants while `pending` / `info_requested`; the
 * profiles guard trigger moves `info_requested` back to `pending` and notifies the reviewers again,
 * who are then e-mailed here.
 */
export const updateRegistrationDetails = withAction(
  registrationDetailsSchema,
  async ({ fullName, employeeNumber, mobile, note }, { ctx }) => {
    if (!ctx) throw new ActionError('errors.sessionExpired');
    const status = ctx.profile.status;
    if (status !== 'pending' && status !== 'info_requested') throw new ActionError('errors.invalidState');
    const supabase = await createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, mobile, registration_employee_number: employeeNumber, registration_note: note || null })
      .eq('id', ctx.user.id);
    if (error) throw error;
    if (status === 'info_requested') after(() => deliverRegistrationEmails(ctx.user.id, ['registration_submitted']));
    revalidatePath('/pending-approval');
    return ok(undefined, status === 'info_requested' ? 'auth.pending.resubmitted' : 'auth.pending.detailsSaved');
  },
  { auth: 'none', scope: 'auth.updateRegistrationDetails' },
);
