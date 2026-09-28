import 'server-only';

import { ActionError, fail, ok, requireActionSession, safeAction, type ActionResult } from '@/lib/action';
import { logAuditEvent } from '@/lib/audit';
import type { SessionContext } from '@/lib/auth/session';
import { brandingCompanyName, brandingPortalName, getPublicBranding } from '@/lib/branding';
import { renderEmailLayout, renderTemplate } from '@/lib/email/render';
import { emailProvider, sendEmail, type SendEmailResult } from '@/lib/email/send';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';
import { can, hasAny } from '@/lib/permissions';
import { createAdminClient, isAdminClientConfigured, type AdminSupabaseClient } from '@/lib/supabase/admin';
import { fetchWithTimeout, getSupabaseEnv, siteUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

/**
 * Portal-access provisioning (ARCHITECTURE §7, docs/DATABASE.md §15). Server-only building blocks
 * used by the users module's Server Actions and the employee profile's Portal access card.
 *
 * Every function:
 *  1. resolves the caller's session and checks the permission first (defense in depth — the RPCs
 *     check again in the database);
 *  2. performs database changes through the caller's RLS client / security-definer RPCs (so the
 *     actor is audited) and uses the service-role client ONLY for GoTrue admin operations
 *     (create user, generate invitation / recovery links, ban);
 *  3. guards self-disable and the last super admin (RPC + trigger enforce it too);
 *  4. writes audit events and returns an `ActionResult` whose error/message are i18n keys.
 *
 * Invitation and recovery links are generated with `auth.admin.generateLink` and delivered with the
 * portal's own bilingual e-mail templates (`account_invitation`, `password_reset`) as
 * `/auth/confirm?token_hash=…&type=invite|recovery&next=/reset-password` — this works on hosted
 * Supabase without customizing the GoTrue e-mail templates and never exposes a token to HR staff.
 * Admin-invited accounts are created with a confirmed e-mail (docs/DATABASE.md §15): an unconfirmed
 * account could otherwise be claimed through GoTrue's public sign-up when e-mail confirmations are
 * off. Their activation link is therefore a `recovery` link (the reset page shows "Set your password").
 *
 * The anonymous self-service e-mails (forgot password, sign-up confirmation) use the same templates
 * (`password_reset`, `registration_confirm`) in the recipient's language — see
 * `deliverSelfServicePasswordReset` / `registerSelfService`. Without a service-role key or an e-mail
 * provider the auth actions fall back to GoTrue's own e-mails.
 */

export type ProvisioningStatus = 'active' | 'disabled';

export type EmailDelivery = SendEmailResult['status'];

export type InviteUserInput = {
  email: string;
  fullName: string;
  roleKeys: string[];
  employeeId?: string | null;
  locale?: Locale | null;
};

export type InviteUserResult = { userId: string; email: EmailDelivery };

type ProfileLite = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  employee_id: string | null;
  preferred_language: string | null;
  invited_at: string | null;
  last_login_at: string | null;
};

const PROFILE_LITE = 'id, email, full_name, status, employee_id, preferred_language, invited_at, last_login_at';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/* ─── helpers ──────────────────────────────────────────────────────────────── */

function requireAdmin(): AdminSupabaseClient {
  if (!isAdminClientConfigured()) throw new ActionError('errors.notConfigured');
  return createAdminClient();
}

async function sessionWith(...permissions: Parameters<typeof hasAny>[1]): Promise<SessionContext> {
  const ctx = await requireActionSession();
  if (!hasAny(ctx, permissions)) throw new ActionError('errors.forbidden');
  return ctx;
}

async function loadProfile(userId: string): Promise<ProfileLite> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').select(PROFILE_LITE).eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new ActionError('errors.notFound');
  return data as ProfileLite;
}

async function isSuperAdminAccount(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('user_roles').select('role:roles!inner(key)').eq('user_id', userId).eq('role.key', 'super_admin');
  if (error) throw error;
  return (data ?? []).length > 0;
}

function recipientLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : 'ar';
}

type LinkType = 'invite' | 'recovery' | 'signup';

function confirmLink(tokenHash: string, type: LinkType): string {
  const next = type === 'signup' ? '/pending-approval' : '/reset-password';
  const params = new URLSearchParams({ token_hash: tokenHash, type, next });
  return `${siteUrl()}/auth/confirm?${params.toString()}`;
}

type AccountTemplateKey = 'account_invitation' | 'password_reset' | 'registration_confirm';

/** i18n fallbacks (`users.email.*`) when a template row is missing or inactive. */
const ACCOUNT_EMAIL_TEXT: Record<AccountTemplateKey, { action: string; subject: string; body: string }> = {
  account_invitation: { action: 'users.email.activate', subject: 'users.email.inviteSubject', body: 'users.email.inviteFallback' },
  password_reset: { action: 'users.email.setPassword', subject: 'users.email.resetSubject', body: 'users.email.resetFallback' },
  registration_confirm: { action: 'users.email.confirmEmail', subject: 'users.email.confirmSubject', body: 'users.email.confirmFallback' },
};

type TemplateRow = { subject_ar: string; subject_en: string; body_ar: string; body_en: string; is_active: boolean };

/**
 * Renders one of the account e-mail templates (`account_invitation` / `password_reset` /
 * `registration_confirm`) in the recipient's language inside the branded layout and sends it
 * (logged in `email_logs`).
 */
async function sendAccountEmail(
  admin: AdminSupabaseClient,
  input: { templateKey: AccountTemplateKey; to: string; name: string | null; locale: Locale; link: string; userId: string },
): Promise<EmailDelivery> {
  const [{ data: template, error }, { data: settings }, branding] = await Promise.all([
    admin.from('email_templates').select('subject_ar, subject_en, body_ar, body_en, is_active').eq('key', input.templateKey).maybeSingle(),
    admin.from('organization_settings').select('email_from_name, email_reply_to').maybeSingle(),
    getPublicBranding(),
  ]);
  if (error) console.error('[provisioning] template lookup failed:', error.code, error.message);
  const tpl = template as TemplateRow | null;
  const t = getTranslator(input.locale);
  const portalName = brandingPortalName(branding, input.locale, t('common.appName'));
  const companyName = brandingCompanyName(branding, input.locale) ?? portalName;
  const vars = {
    recipient_name: input.name || input.to,
    employee_name: input.name || input.to,
    company_name: companyName,
    portal_name: portalName,
    link: input.link,
  };
  const text = ACCOUNT_EMAIL_TEXT[input.templateKey];
  const actionLabel = t(text.action);
  const subject = tpl?.is_active
    ? renderTemplate(input.locale === 'ar' ? tpl.subject_ar : tpl.subject_en, vars, { html: false })
    : t(text.subject, { portal: portalName });
  const bodyHtml = tpl?.is_active
    ? renderTemplate(input.locale === 'ar' ? tpl.body_ar : tpl.body_en, vars)
    : `<p>${t(text.body, { portal: portalName })}</p>`;
  const html = renderEmailLayout({
    locale: input.locale,
    subject,
    bodyHtml,
    branding: { portalName, companyName, logoUrl: branding.logoUrl, primaryColor: branding.primaryColor, secondaryColor: branding.secondaryColor },
    // The template body already contains the button; the layout button is only a fallback.
    action: tpl?.is_active ? null : { label: actionLabel, url: input.link },
    footerNote: t('notifications.email.footer', { portal: portalName }),
  });
  const s = (settings ?? null) as { email_from_name?: string | null; email_reply_to?: string | null } | null;
  const result = await sendEmail({
    to: input.to,
    subject,
    html,
    fromName: s?.email_from_name ?? null,
    replyTo: s?.email_reply_to ?? null,
    templateKey: input.templateKey,
    relatedEntityType: 'profile',
    relatedEntityId: input.userId,
  });
  return result.status;
}

async function generateAccountLink(admin: AdminSupabaseClient, email: string, type: 'invite' | 'recovery'): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error) throw error;
  const hashed = data?.properties?.hashed_token;
  if (!hashed) throw new Error('generateLink returned no token');
  return confirmLink(hashed, type);
}

/* ─── invite ───────────────────────────────────────────────────────────────── */

/**
 * Creates an admin-provisioned portal account (`active`, `invited_at`), links the employee and assigns
 * roles as the caller, then e-mails the invitation. Needs `users.create` + `users.administer`
 * (role assignment); granting `super_admin` needs a super admin.
 */
export async function inviteUser(input: InviteUserInput): Promise<ActionResult<InviteUserResult>> {
  return safeAction('provisioning.inviteUser', async () => {
    const ctx = await sessionWith('users.create');
    if (!can(ctx, 'users.administer')) throw new ActionError('errors.forbidden');

    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    const roleKeys = Array.from(new Set(input.roleKeys.map((k) => k.trim()).filter(Boolean)));
    if (!EMAIL_RE.test(email)) return fail('errors.validation', { email: 'validation.email' });
    if (!fullName) return fail('errors.validation', { fullName: 'validation.required' });
    if (!roleKeys.length) return fail('errors.validation', { roleKeys: 'validation.selectAtLeastOne' });
    if (roleKeys.includes('super_admin') && !ctx.isSuperAdmin) throw new ActionError('users.errors.superAdminOnly');

    const supabase = await createClient();
    const [existing, roles, linked] = await Promise.all([
      supabase.from('profiles').select('id').eq('email', email).maybeSingle(),
      supabase.from('roles').select('key').in('key', roleKeys),
      input.employeeId
        ? supabase.from('profiles').select('id').eq('employee_id', input.employeeId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (existing.error) throw existing.error;
    if (existing.data) return fail('errors.emailTaken', { email: 'users.errors.emailInUse' });
    if (roles.error) throw roles.error;
    if ((roles.data ?? []).length !== roleKeys.length) throw new ActionError('errors.roleNotFound');
    if (linked.error) throw linked.error;
    if (linked.data) return fail('errors.employeeAlreadyLinked', { employeeId: 'errors.employeeAlreadyLinked' });

    const admin = requireAdmin();
    const locale: Locale = input.locale && isLocale(input.locale) ? input.locale : ctx.locale;
    const created = await admin.auth.admin.createUser({
      email,
      // Confirmed: an unconfirmed account could be claimed via GoTrue's public sign-up (autoconfirm).
      email_confirm: true,
      app_metadata: { invited_by_admin: true },
      user_metadata: { full_name: fullName, preferred_language: locale },
    });
    if (created.error || !created.data.user) {
      const code = (created.error as { code?: string } | null)?.code;
      if (code === 'email_exists' || code === 'user_already_exists') return fail('errors.emailTaken', { email: 'users.errors.emailInUse' });
      throw created.error ?? new Error('createUser returned no user');
    }
    const userId = created.data.user.id;

    // Link + roles as the caller (audited with the HR actor). Roll the auth user back on failure.
    try {
      if (input.employeeId) {
        const { error } = await supabase.rpc('set_user_employee', { p_user_id: userId, p_employee_id: input.employeeId });
        if (error) throw error;
      }
      const { error } = await supabase.rpc('set_user_roles', { p_user_id: userId, p_role_keys: roleKeys });
      if (error) throw error;
    } catch (error) {
      const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
      if (deleteError) console.error('[provisioning] rollback deleteUser failed:', deleteError.message);
      throw error;
    }

    let delivery: EmailDelivery = 'failed';
    try {
      const link = await generateAccountLink(admin, email, 'recovery');
      delivery = await sendAccountEmail(admin, { templateKey: 'account_invitation', to: email, name: fullName, locale, link, userId });
    } catch (error) {
      console.error('[provisioning] invitation e-mail failed:', error instanceof Error ? error.message : error);
    }
    await logAuditEvent(
      {
        action: 'user.invitation_sent',
        entityType: 'profile',
        entityId: userId,
        summary: email,
        changes: { roles: roleKeys, employee_id: input.employeeId ?? null, email_delivery: delivery },
      },
      supabase,
    );
    return ok({ userId, email: delivery }, delivery === 'sent' ? 'users.toast.invited' : 'users.toast.invitedNoEmail');
  });
}

/* ─── resend invitation / password reset ───────────────────────────────────── */

/** Sends a fresh invitation link to an account that has not signed in yet. */
export async function resendInvitation(userId: string): Promise<ActionResult<{ email: EmailDelivery }>> {
  return safeAction('provisioning.resendInvitation', async () => {
    await sessionWith('users.create', 'users.edit');
    const profile = await loadProfile(userId);
    if (!profile.email) throw new ActionError('errors.invalidState');
    if (profile.status !== 'active') throw new ActionError('users.errors.notActive');
    if (profile.last_login_at) throw new ActionError('users.errors.invitationAccepted');

    const admin = requireAdmin();
    const { data: authUser, error } = await admin.auth.admin.getUserById(userId);
    if (error || !authUser.user) throw error ?? new ActionError('errors.notFound');
    // Unconfirmed → a new invite token; already confirmed (e.g. created confirmed) → a recovery token.
    const link = await generateAccountLink(admin, profile.email, authUser.user.email_confirmed_at ? 'recovery' : 'invite');
    const delivery = await sendAccountEmail(admin, {
      templateKey: 'account_invitation',
      to: profile.email,
      name: profile.full_name,
      locale: recipientLocale(profile.preferred_language),
      link,
      userId,
    });
    await logAuditEvent({ action: 'user.invitation_sent', entityType: 'profile', entityId: userId, summary: profile.email, changes: { resend: true, email_delivery: delivery } });
    if (delivery !== 'sent') return fail(delivery === 'skipped' ? 'users.errors.emailNotConfigured' : 'errors.emailFailed');
    return ok({ email: delivery }, 'users.toast.invitationResent');
  });
}

/**
 * E-mails a password-reset link (portal template) to an account, by id or e-mail. Accounts that never
 * accepted their invitation get a fresh invitation instead.
 */
export async function sendPasswordReset(target: string | { userId?: string; email?: string }): Promise<ActionResult<{ email: EmailDelivery }>> {
  return safeAction('provisioning.sendPasswordReset', async () => {
    await sessionWith('users.edit');
    const supabase = await createClient();
    const key = typeof target === 'string' ? (EMAIL_RE.test(target) ? { email: target } : { userId: target }) : target;
    let query = supabase.from('profiles').select(PROFILE_LITE);
    if (key.userId) query = query.eq('id', key.userId);
    else if (key.email) query = query.eq('email', key.email.trim().toLowerCase());
    else throw new ActionError('errors.validation');
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    const profile = data as ProfileLite | null;
    if (!profile?.email) throw new ActionError('errors.notFound');
    if (profile.status === 'disabled' || profile.status === 'rejected') throw new ActionError('users.errors.notActive');

    const admin = requireAdmin();
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(profile.id);
    if (authError || !authUser.user) throw authError ?? new ActionError('errors.notFound');
    if (profile.invited_at && !profile.last_login_at) {
      // Never activated: the useful e-mail is the invitation.
      return resendInvitation(profile.id);
    }
    const link = await generateAccountLink(admin, profile.email, 'recovery');
    const delivery = await sendAccountEmail(admin, {
      templateKey: 'password_reset',
      to: profile.email,
      name: profile.full_name,
      locale: recipientLocale(profile.preferred_language),
      link,
      userId: profile.id,
    });
    await logAuditEvent({ action: 'user.password_reset_sent', entityType: 'profile', entityId: profile.id, summary: profile.email, changes: { email_delivery: delivery } }, supabase);
    if (delivery !== 'sent') return fail(delivery === 'skipped' ? 'users.errors.emailNotConfigured' : 'errors.emailFailed');
    return ok({ email: delivery }, 'users.toast.resetSent');
  });
}

/* ─── employee link ────────────────────────────────────────────────────────── */

/** Links a portal account to an employee record (RPC `set_user_employee`, org `users.edit`). */
export async function linkEmployee(userId: string, employeeId: string): Promise<ActionResult> {
  return safeAction('provisioning.linkEmployee', async () => {
    await sessionWith('users.edit');
    const supabase = await createClient();
    const { error } = await supabase.rpc('set_user_employee', { p_user_id: userId, p_employee_id: employeeId });
    if (error) throw error;
    return ok(undefined, 'users.toast.linked');
  });
}

/** Removes the employee link of a portal account (the account keeps its roles and status). */
export async function unlinkEmployee(userId: string): Promise<ActionResult> {
  return safeAction('provisioning.unlinkEmployee', async () => {
    await sessionWith('users.edit');
    const supabase = await createClient();
    // The generated types mark the argument as non-null; the RPC documents `null` as "unlink".
    const { error } = await supabase.rpc('set_user_employee', { p_user_id: userId, p_employee_id: null as unknown as string });
    if (error) throw error;
    return ok(undefined, 'users.toast.unlinked');
  });
}

/* ─── enable / disable ─────────────────────────────────────────────────────── */

/**
 * Enables or disables sign-in. The RPC `set_user_status` blocks every data access immediately
 * (policies require an active profile) and protects self / super admins / the last super admin; the
 * GoTrue ban additionally stops new tokens from being issued.
 */
export async function setUserStatus(userId: string, status: ProvisioningStatus): Promise<ActionResult> {
  return safeAction('provisioning.setUserStatus', async () => {
    const ctx = await sessionWith('users.edit');
    if (status !== 'active' && status !== 'disabled') throw new ActionError('errors.validation');
    if (userId === ctx.user.id) throw new ActionError('users.errors.cannotChangeSelf');
    if (!ctx.isSuperAdmin && (await isSuperAdminAccount(userId))) throw new ActionError('users.errors.superAdminOnly');

    const supabase = await createClient();
    const { error } = await supabase.rpc('set_user_status', { p_user_id: userId, p_status: status });
    if (error) throw error;

    if (isAdminClientConfigured()) {
      const { error: banError } = await createAdminClient().auth.admin.updateUserById(userId, {
        ban_duration: status === 'disabled' ? '876000h' : 'none',
      });
      if (banError) console.error('[provisioning] ban update failed:', banError.message);
    }
    return ok(undefined, status === 'disabled' ? 'users.toast.disabled' : 'users.toast.enabled');
  });
}

/* ─── self-service e-mails (anonymous: forgot password, sign-up) ───────────── */

/**
 * The anonymous self-service flows run without a session, so the service role is used strictly for
 * GoTrue admin operations (generate a link / create the applicant) and for reading the one profile /
 * `email_logs` rows of the address being handled. Nothing reveals whether an address is registered.
 */
const RESEND_INTERVAL_MS = 60_000;
const HOURLY_CAP_PER_ADDRESS = 5;
const SIGNUP_WINDOW_MS = 5 * 60_000;
const SIGNUP_WINDOW_CAP = 30;

/** Whether the portal can send the self-service account e-mails itself (else GoTrue's e-mails are used). */
export function canSendAccountEmails(): boolean {
  return isAdminClientConfigured() && emailProvider() !== null && Boolean(process.env.EMAIL_FROM?.trim());
}

let autoconfirmCache: { value: boolean | null; at: number } | null = null;

/** GoTrue `mailer_autoconfirm` (e-mail confirmations off), cached for 5 minutes; `null` when unknown. */
async function gotrueAutoconfirm(): Promise<boolean | null> {
  if (autoconfirmCache && Date.now() - autoconfirmCache.at < 5 * 60_000) return autoconfirmCache.value;
  const env = getSupabaseEnv();
  let value: boolean | null = null;
  if (env) {
    try {
      const res = await fetchWithTimeout(5000)(`${env.url}/auth/v1/settings`, { headers: { apikey: env.anonKey }, cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { mailer_autoconfirm?: unknown };
        value = typeof body.mailer_autoconfirm === 'boolean' ? body.mailer_autoconfirm : null;
      }
    } catch (error) {
      console.error('[provisioning] reading auth settings failed:', error instanceof Error ? error.message : error);
    }
  }
  autoconfirmCache = { value, at: Date.now() };
  return value;
}

/**
 * Self-registration sends the portal's `registration_confirm` e-mail when the portal can send e-mail
 * and GoTrue requires e-mail confirmation. With confirmations off GoTrue sends nothing and signs the
 * applicant in, so the regular `supabase.auth.signUp` is kept.
 */
export async function portalSignUpEnabled(): Promise<boolean> {
  if (!canSendAccountEmails()) return false;
  return (await gotrueAutoconfirm()) !== true;
}

/** Per-address throttle over `email_logs`: one e-mail per minute, at most 5 per hour. */
async function addressThrottled(admin: AdminSupabaseClient, to: string, templateKeys: AccountTemplateKey[]): Promise<boolean> {
  const { data, error } = await admin
    .from('email_logs')
    .select('created_at')
    .eq('recipient', to)
    .in('template_key', templateKeys)
    .gte('created_at', new Date(Date.now() - 60 * 60_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(HOURLY_CAP_PER_ADDRESS);
  if (error) {
    console.error('[provisioning] throttle lookup failed:', error.code, error.message);
    return false;
  }
  const rows = (data ?? []) as { created_at: string }[];
  if (rows.length >= HOURLY_CAP_PER_ADDRESS) return true;
  const last = rows[0] ? Date.parse(rows[0].created_at) : 0;
  return Date.now() - last < RESEND_INTERVAL_MS;
}

/**
 * Forgot password (anonymous): e-mails the portal's bilingual `password_reset` template — or a fresh
 * invitation for an account that never activated — in the account's language (else `fallbackLocale`).
 * Unknown, disabled and rejected addresses get nothing. Throttled per address. Never throws; run it
 * inside `after()` so the response time does not depend on whether the address exists.
 */
export async function deliverSelfServicePasswordReset(email: string, fallbackLocale: Locale): Promise<void> {
  try {
    const admin = requireAdmin();
    const address = email.trim().toLowerCase();
    const { data, error } = await admin.from('profiles').select(PROFILE_LITE).eq('email', address).maybeSingle();
    if (error) throw error;
    const profile = data as ProfileLite | null;
    if (!profile?.email || profile.status === 'disabled' || profile.status === 'rejected') return;
    const invitation = Boolean(profile.invited_at) && !profile.last_login_at;
    if (await addressThrottled(admin, profile.email, ['password_reset', 'account_invitation'])) return;

    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(profile.id);
    if (authError || !authUser.user) throw authError ?? new Error('auth user not found');
    const link = await generateAccountLink(admin, profile.email, invitation && !authUser.user.email_confirmed_at ? 'invite' : 'recovery');
    const delivery = await sendAccountEmail(admin, {
      templateKey: invitation ? 'account_invitation' : 'password_reset',
      to: profile.email,
      name: profile.full_name,
      locale: isLocale(profile.preferred_language) ? profile.preferred_language : fallbackLocale,
      link,
      userId: profile.id,
    });
    await logAuditEvent(
      {
        action: invitation ? 'user.invitation_sent' : 'user.password_reset_sent',
        entityType: 'profile',
        entityId: profile.id,
        summary: profile.email,
        changes: { self_service: true, email_delivery: delivery },
      },
      admin,
    );
  } catch (error) {
    console.error('[provisioning] self-service reset failed:', error instanceof Error ? error.message : error);
  }
}

export type SelfRegistrationInput = {
  email: string;
  password: string;
  fullName: string;
  mobile: string;
  employeeNumber: string;
  language: Locale;
};

/**
 * Self-registration with the portal's `registration_confirm` e-mail (docs/DATABASE.md §15): creates
 * the unconfirmed applicant through `generateLink({ type: 'signup' })` — the `on_auth_user_created`
 * trigger turns the untrusted metadata into a `pending` profile exactly like `auth.signUp` — and
 * returns the new user id plus the e-mail step to run inside `after()`.
 * An address that is already registered gets no account and no hint: a still-unconfirmed
 * self-registration receives a fresh confirmation link (its password is not changed).
 * Throws `errors.rateLimited` when too many accounts were registered in the last 5 minutes.
 */
export async function registerSelfService(input: SelfRegistrationInput): Promise<{ newUserId: string | null; sendConfirmation: () => Promise<void> }> {
  const admin = requireAdmin();
  const address = input.email.trim().toLowerCase();
  const noop = { newUserId: null, sendConfirmation: async () => {} };

  const { data: existing, error: existingError } = await admin
    .from('profiles')
    .select('id, full_name, invited_at, preferred_language')
    .eq('email', address)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const row = existing as { id: string; full_name: string | null; invited_at: string | null; preferred_language: string | null };
    if (row.invited_at) return noop;
    return {
      newUserId: null,
      sendConfirmation: async () => {
        try {
          const { data: authUser } = await admin.auth.admin.getUserById(row.id);
          if (!authUser?.user || authUser.user.email_confirmed_at) return;
          if (await addressThrottled(admin, address, ['registration_confirm'])) return;
          const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email: address, password: input.password });
          if (error) throw error;
          const hashed = data?.properties?.hashed_token;
          if (!hashed) throw new Error('generateLink returned no token');
          await sendAccountEmail(admin, {
            templateKey: 'registration_confirm',
            to: address,
            name: row.full_name,
            locale: isLocale(row.preferred_language) ? row.preferred_language : input.language,
            link: confirmLink(hashed, 'signup'),
            userId: row.id,
          });
        } catch (error) {
          console.error('[provisioning] confirmation resend failed:', error instanceof Error ? error.message : error);
        }
      },
    };
  }

  const { count, error: countError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .is('invited_at', null)
    .gte('created_at', new Date(Date.now() - SIGNUP_WINDOW_MS).toISOString());
  if (countError) throw countError;
  if ((count ?? 0) >= SIGNUP_WINDOW_CAP) throw new ActionError('errors.rateLimited');

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: address,
    password: input.password,
    options: {
      // Untrusted metadata: copied into the pending profile's registration fields only (DATABASE §15).
      data: { full_name: input.fullName, mobile: input.mobile, employee_number: input.employeeNumber, preferred_language: input.language },
    },
  });
  if (error) {
    const code = (error as { code?: string }).code;
    // A concurrent registration of the same address: behave exactly like an existing one.
    if (code === 'email_exists' || code === 'user_already_exists') return noop;
    throw error;
  }
  const userId = data?.user?.id ?? null;
  const hashed = data?.properties?.hashed_token;
  if (!userId || !hashed) throw new Error('generateLink returned no user or token');
  return {
    newUserId: userId,
    sendConfirmation: async () => {
      try {
        await sendAccountEmail(admin, {
          templateKey: 'registration_confirm',
          to: address,
          name: input.fullName,
          locale: input.language,
          link: confirmLink(hashed, 'signup'),
          userId,
        });
      } catch (error) {
        console.error('[provisioning] confirmation e-mail failed:', error instanceof Error ? error.message : error);
      }
    },
  };
}
