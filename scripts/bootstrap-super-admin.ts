/**
 * Super Admin bootstrap (docs/DATABASE.md §15, ARCHITECTURE §10).
 *
 *   pnpm bootstrap:super-admin --email owner@company.com [--print-link]
 *
 * 1. Loads `.env.local` / `.env` (existing environment variables win) and connects with the
 *    service-role key (server-side only; nothing secret is ever printed).
 * 2. Finds the Auth user by e-mail (paginating `auth.admin.listUsers`).
 *    - Absent → creates it as an admin-provisioned account (`app_metadata.invited_by_admin`, e-mail
 *      confirmed — an unconfirmed account could be claimed through GoTrue's public sign-up when e-mail
 *      confirmations are off) and e-mails the portal's bilingual `account_invitation` template
 *      (Arabic-first, organization language) with a one-time link to `/reset-password` ("Set your
 *      password") via RESEND_API_KEY / SMTP_HOST + EMAIL_FROM, logged in `email_logs`. Without an
 *      e-mail provider Supabase Auth sends its own e-mail. If sending fails, the link is printed only
 *      with `--print-link`.
 *    - Present → kept as is (existing password and roles stay). An account that never activated gets
 *      a fresh invitation; with `--print-link` an activated account gets a one-time password link.
 * 3. Makes the profile `active`, adds the `super_admin` role (other roles are kept) and records
 *    `user.bootstrap_super_admin` in the audit log.
 * Idempotent: re-running only (re)sends the invitation when the account is still not activated.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { htmlToText, renderEmailLayout, renderTemplate } from '../src/lib/email/render';

type Args = { email: string | null; printLink: boolean; help: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { email: null, printLink: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--email') args.email = argv[++i] ?? null;
    else if (a.startsWith('--email=')) args.email = a.slice('--email='.length);
    else if (a === '--print-link') args.printLink = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

/** Tiny dotenv reader: KEY=value lines, optional quotes, `#` comments. Never overrides existing env. */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<User | null> {
  const perPage = 1000;
  for (let page = 1; page <= 1000; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Could not list users: ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (found) return found;
    if (users.length < perPage) return null;
  }
  return null;
}

async function generateConfirmLink(admin: SupabaseClient, email: string, type: 'invite' | 'recovery', site: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) {
    console.error(`  Could not generate a ${type} link: ${error?.message ?? 'no token returned'}`);
    return null;
  }
  const params = new URLSearchParams({ token_hash: hashed, type, next: '/reset-password' });
  return `${site}/auth/confirm?${params.toString()}`;
}

type Lang = 'ar' | 'en';

/** Minimal `{placeholder}` translator over `locales/<lang>/<namespace>.json` (the script runs outside Next). */
function message(root: string, lang: Lang, key: string, values: Record<string, string> = {}): string {
  const [ns, ...rest] = key.split('.');
  let node: unknown = JSON.parse(readFileSync(path.join(root, 'locales', lang, `${ns}.json`), 'utf8'));
  for (const part of rest) node = (node as Record<string, unknown> | undefined)?.[part];
  const text = typeof node === 'string' ? node : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '');
}

/** `EMAIL_FROM` (`Name <addr>` or `addr`) with an optional display-name override. */
function fromAddress(fromName: string | null): string | null {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return null;
  const match = /<([^>]+)>/.exec(raw);
  const address = (match ? match[1] : raw)!.trim();
  if (!EMAIL_RE.test(address)) return null;
  const name = (fromName ?? (match ? raw.slice(0, raw.indexOf('<')).trim().replace(/^"|"$/g, '') : '')).replace(/[\r\n"<>]/g, '');
  return name ? `"${name}" <${address}>` : address;
}

/**
 * E-mails the portal's `account_invitation` template (same rendering as src/lib/auth/provisioning.ts)
 * and logs it in `email_logs`. `skipped` when no e-mail provider is configured.
 */
async function sendInvitationEmail(
  admin: SupabaseClient,
  root: string,
  input: { to: string; link: string; userId: string; lang: Lang | null },
): Promise<'sent' | 'failed' | 'skipped'> {
  const provider = process.env.RESEND_API_KEY?.trim() ? 'resend' : process.env.SMTP_HOST?.trim() ? 'smtp' : null;
  const [{ data: tpl }, { data: org }] = await Promise.all([
    admin.from('email_templates').select('subject_ar, subject_en, body_ar, body_en, is_active').eq('key', 'account_invitation').maybeSingle(),
    admin
      .from('organization_settings')
      .select('default_language, portal_name_ar, portal_name_en, primary_color, secondary_color, email_from_name, email_reply_to')
      .maybeSingle(),
  ]);
  const o = (org ?? {}) as Record<string, string | null>;
  const lang: Lang = input.lang ?? (o.default_language === 'en' ? 'en' : 'ar');
  const portalName = (lang === 'ar' ? o.portal_name_ar || o.portal_name_en : o.portal_name_en || o.portal_name_ar) || message(root, lang, 'common.appName');
  const t = tpl as { subject_ar: string; subject_en: string; body_ar: string; body_en: string; is_active: boolean } | null;
  const vars = { recipient_name: input.to, employee_name: input.to, company_name: portalName, portal_name: portalName, link: input.link };
  const subject = t?.is_active
    ? renderTemplate(lang === 'ar' ? t.subject_ar : t.subject_en, vars, { html: false })
    : message(root, lang, 'users.email.inviteSubject', { portal: portalName });
  const html = renderEmailLayout({
    locale: lang,
    subject,
    bodyHtml: t?.is_active ? renderTemplate(lang === 'ar' ? t.body_ar : t.body_en, vars) : `<p>${message(root, lang, 'users.email.inviteFallback', { portal: portalName })}</p>`,
    branding: { portalName, companyName: portalName, primaryColor: o.primary_color, secondaryColor: o.secondary_color },
    action: t?.is_active ? null : { label: message(root, lang, 'users.email.activate'), url: input.link },
    footerNote: message(root, lang, 'notifications.email.footer', { portal: portalName }),
  });
  const from = fromAddress(o.email_from_name ?? null);
  const replyTo = o.email_reply_to || undefined;
  if (!provider || !from) return 'skipped';

  let status: 'sent' | 'failed' = 'failed';
  let messageId: string | null = null;
  let failure: string | null = null;
  try {
    if (provider === 'resend') {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [input.to], subject, html, text: htmlToText(html), ...(replyTo ? { reply_to: replyTo } : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (res.ok) [status, messageId] = ['sent', body.id ?? null];
      else failure = `HTTP ${res.status}: ${body.message ?? 'error'}`;
    } else {
      const nodemailer = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT) || 587;
      const user = process.env.SMTP_USER?.trim();
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST!.trim(),
        port,
        secure: (process.env.SMTP_SECURE ?? '').trim().toLowerCase() === 'true' || port === 465,
        auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
        connectionTimeout: 10000,
      });
      const info = await transport.sendMail({ from, to: input.to, subject, html, text: htmlToText(html), ...(replyTo ? { replyTo } : {}) });
      [status, messageId] = ['sent', info.messageId ?? null];
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const { error: logError } = await admin.rpc('log_email', {
    p_recipient: input.to,
    p_status: status,
    p_subject: subject,
    p_template_key: 'account_invitation',
    p_related_entity_type: 'profile',
    p_related_entity_id: input.userId,
    p_provider: provider,
    p_provider_message_id: messageId,
    p_error: failure ? failure.slice(0, 1000) : null,
  });
  if (logError) console.error(`  ! email_logs not written: ${logError.message}`);
  if (failure) console.error(`  ! The invitation e-mail could not be sent (${failure}).`);
  return status;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: pnpm bootstrap:super-admin --email <address> [--print-link]');
    return;
  }
  const root = process.cwd();
  loadEnvFile(path.join(root, '.env.local'));
  loadEnvFile(path.join(root, '.env'));

  const email = (args.email ?? process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) fail('Pass the owner e-mail: pnpm bootstrap:super-admin --email owner@company.com');
  if (!EMAIL_RE.test(email)) fail(`"${email}" is not a valid e-mail address.`);

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !serviceKey) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (environment, .env.local or .env).');
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '') || 'http://localhost:3000';

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  console.log(`Bootstrapping Super Admin for ${email}`);

  // 1. Find or create the Auth user ------------------------------------------------------------
  let user = await findUserByEmail(admin, email);
  const created = !user;
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { invited_by_admin: true },
      user_metadata: {},
    });
    if (error || !data.user) fail(`Could not create the Auth user: ${error?.message ?? 'unknown error'}`);
    user = data.user;
    console.log('  ✓ Auth user created');
  } else {
    console.log('  ✓ Existing Auth user found (kept as is)');
  }
  const userId = user.id;
  const activated = Boolean(user.last_sign_in_at);

  // 2. Profile active --------------------------------------------------------------------------------
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, status, preferred_language')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) fail(`Could not read the profile: ${profileError.message}`);
  if (!profile) {
    const { error } = await admin
      .from('profiles')
      .insert({ id: userId, email, status: 'active', invited_at: created ? new Date().toISOString() : null });
    if (error) fail(`Could not create the profile: ${error.message}`);
  } else if (profile.status !== 'active') {
    const { error } = await admin.from('profiles').update({ status: 'active', reviewed_at: new Date().toISOString(), review_note: null }).eq('id', userId);
    if (error) fail(`Could not activate the profile: ${error.message}`);
  }
  console.log('  ✓ Profile active');

  // 3. super_admin role (other roles kept) ------------------------------------------------------------
  const { data: role, error: roleError } = await admin.from('roles').select('id').eq('key', 'super_admin').maybeSingle();
  if (roleError || !role) fail(`The super_admin role is missing — apply the migrations first. ${roleError?.message ?? ''}`.trim());
  const { error: grantError } = await admin
    .from('user_roles')
    .upsert({ user_id: userId, role_id: role.id }, { onConflict: 'user_id,role_id', ignoreDuplicates: true });
  if (grantError) fail(`Could not assign the super_admin role: ${grantError.message}`);
  console.log('  ✓ super_admin role assigned');

  // 4. Invitation / link -------------------------------------------------------------------------------
  let delivery: 'invitation_sent' | 'link_generated' | 'none' = 'none';
  if (!activated) {
    const type = user.email_confirmed_at ? 'recovery' : 'invite';
    const link = await generateConfirmLink(admin, email, type, site);
    const lang = profile?.preferred_language === 'en' || profile?.preferred_language === 'ar' ? (profile.preferred_language as Lang) : null;
    const sent = link ? await sendInvitationEmail(admin, root, { to: email, link, userId, lang }) : 'failed';
    if (sent === 'sent') {
      delivery = 'invitation_sent';
      console.log('  ✓ Invitation e-mail sent — open it to set the password');
    } else if (sent === 'skipped') {
      // No portal e-mail provider (RESEND_API_KEY / SMTP_HOST + EMAIL_FROM): Supabase Auth's own e-mail.
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: `${site}/reset-password?type=invite` });
      if (!error) {
        delivery = 'invitation_sent';
        console.log('  ✓ Set-password e-mail sent by Supabase Auth (configure an e-mail provider for the branded Arabic/English e-mail)');
      } else {
        console.error(`  ! The set-password e-mail could not be sent (${error.message}).`);
      }
    }
    if (delivery === 'none') {
      const fresh = sent === 'skipped' ? await generateConfirmLink(admin, email, type, site) : link;
      if (fresh) {
        delivery = 'link_generated';
        if (args.printLink) console.log(`\n  Activation link (single use, expires soon — share it only with ${email}):\n  ${fresh}\n`);
        else console.log('  Re-run with --print-link to print a one-time activation link instead.');
      }
    }
  } else if (args.printLink) {
    const link = await generateConfirmLink(admin, email, 'recovery', site);
    if (link) {
      delivery = 'link_generated';
      console.log(`\n  Password link (single use, expires soon — share it only with ${email}):\n  ${link}\n`);
    }
  } else {
    console.log('  • The account is already activated — sign in with its existing password (or use "Forgot password").');
  }

  // 5. Audit ---------------------------------------------------------------------------------------------
  const { error: auditError } = await admin.rpc('log_audit_event', {
    p_action: 'user.bootstrap_super_admin',
    p_entity_type: 'profile',
    p_entity_id: userId,
    p_summary: email,
    p_changes: { created, delivery },
  });
  if (auditError) console.error(`  ! Audit event not recorded: ${auditError.message}`);
  else console.log('  ✓ Audit event recorded');

  console.log(`\nDone. ${email} is a Super Admin. Sign in at ${site}/login`);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
