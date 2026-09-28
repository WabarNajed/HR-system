/**
 * Super Admin bootstrap (docs/DATABASE.md §15, ARCHITECTURE §10).
 *
 *   pnpm bootstrap:super-admin --email owner@company.com [--print-link]
 *
 * 1. Loads `.env.local` / `.env` (existing environment variables win) and connects with the
 *    service-role key (server-side only; nothing secret is ever printed).
 * 2. Finds the Auth user by e-mail (paginating `auth.admin.listUsers`).
 *    - Absent → creates it as an admin-provisioned account (`app_metadata.invited_by_admin`) and
 *      sends the Supabase invitation e-mail (`inviteUserByEmail`, redirect → `/reset-password`, which
 *      doubles as "Set your password"). If sending fails, an invitation link is generated instead and
 *      printed only with `--print-link`.
 *    - Present → kept as is (existing password and roles stay). An account that never activated gets
 *      a fresh invitation; with `--print-link` an activated account gets a one-time password link.
 * 3. Makes the profile `active`, adds the `super_admin` role (other roles are kept) and records
 *    `user.bootstrap_super_admin` in the audit log.
 * Idempotent: re-running only (re)sends the invitation when the account is still not activated.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
      email_confirm: false,
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
  const activated = Boolean(user.email_confirmed_at) && Boolean(user.last_sign_in_at);

  // 2. Profile active --------------------------------------------------------------------------------
  const { data: profile, error: profileError } = await admin.from('profiles').select('id, status').eq('id', userId).maybeSingle();
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
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${site}/reset-password?type=invite` });
    if (!error) {
      delivery = 'invitation_sent';
      console.log('  ✓ Invitation e-mail sent — open it to set the password');
    } else {
      console.error(`  ! The invitation e-mail could not be sent (${error.message}).`);
      const link = await generateConfirmLink(admin, email, user.email_confirmed_at ? 'recovery' : 'invite', site);
      if (link) {
        delivery = 'link_generated';
        if (args.printLink) console.log(`\n  Activation link (single use, expires soon — share it only with ${email}):\n  ${link}\n`);
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
