import 'server-only';

import type { SessionContext } from '@/lib/auth/session';
import { emailProvider } from '@/lib/email/send';
import { can } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';

/** Data for Settings › Security (each section degrades independently when a permission is missing). */

export type SecuritySettings = { allowSelfRegistration: boolean; sessionTimeoutMinutes: number; updatedAt: string | null };

export type SuperAdminOwner = { id: string; fullName: string | null; email: string | null; status: string; lastLoginAt: string | null; isSelf: boolean };

export type SignInEvent = { id: number; action: 'auth.login' | 'auth.logout'; actorEmail: string | null; actorId: string | null; ip: string | null; userAgent: string | null; createdAt: string };

export type EmailStatus = { provider: 'resend' | 'smtp' | null; from: string | null; configured: boolean };

export async function getSecuritySettings(): Promise<SecuritySettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('organization_settings').select('allow_self_registration, session_timeout_minutes, updated_at').maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { allowSelfRegistration: data.allow_self_registration, sessionTimeoutMinutes: data.session_timeout_minutes, updatedAt: data.updated_at };
}

export async function getSuperAdminOwners(ctx: SessionContext): Promise<SuperAdminOwner[] | null> {
  if (!can(ctx, 'users.view')) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_roles')
    .select('user:profiles!user_id(id, full_name, email, status, last_login_at), role:roles!inner(key)')
    .eq('role.key', 'super_admin');
  if (error) throw error;
  return (data ?? [])
    .map((r) => r.user as unknown as { id: string; full_name: string | null; email: string | null; status: string; last_login_at: string | null } | null)
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, status: u.status, lastLoginAt: u.last_login_at, isSelf: u.id === ctx.user.id }))
    .sort((a, b) => (a.status === b.status ? (a.fullName ?? a.email ?? '').localeCompare(b.fullName ?? b.email ?? '') : a.status === 'active' ? -1 : 1));
}

export async function getRecentSignIns(ctx: SessionContext, limit = 20): Promise<SignInEvent[] | null> {
  if (!can(ctx, 'audit.view')) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, actor_email, actor_id, ip, user_agent, created_at')
    .in('action', ['auth.login', 'auth.logout'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    action: r.action as SignInEvent['action'],
    actorEmail: r.actor_email,
    actorId: r.actor_id,
    ip: r.ip,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }));
}

/** Which e-mail transport the server is configured with (env only — never exposes secrets). */
export function getEmailStatus(): EmailStatus {
  const provider = emailProvider();
  const raw = process.env.EMAIL_FROM?.trim() || null;
  const match = raw ? /<([^>]+)>/.exec(raw) : null;
  const from = raw ? (match ? match[1]! : raw).trim() : null;
  return { provider, from, configured: Boolean(provider && from) };
}
