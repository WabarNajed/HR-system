import { assertLocalSupabase, SERVICE_ROLE_KEY, SUPABASE_URL } from './env';

/**
 * Minimal PostgREST helpers with the LOCAL service-role key, used only to look up fixture ids and to
 * restore fixture state a spec changed (never to create product data).
 */

async function rest<T>(pathAndQuery: string, init: RequestInit = {}): Promise<T> {
  assertLocalSupabase();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`PostgREST ${init.method ?? 'GET'} ${pathAndQuery} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function employeeIdByNumber(employeeNumber: string): Promise<string> {
  const rows = await rest<{ id: string }[]>(`employees?select=id&employee_number=eq.${encodeURIComponent(employeeNumber)}&limit=1`);
  if (!rows[0]) throw new Error(`Fixture employee ${employeeNumber} not found — run scripts/dev/seed-local-fixtures.mjs`);
  return rows[0].id;
}

/** Any submitted request (drafts are private to their requester), or null when there is none yet. */
export async function anySubmittedRequestId(): Promise<string | null> {
  const rows = await rest<{ id: string }[]>('hr_requests?select=id&request_number=not.is.null&order=created_at.desc&limit=1');
  return rows[0]?.id ?? null;
}

export async function profileByEmail(email: string): Promise<{ id: string; preferred_language: string | null }> {
  const rows = await rest<{ id: string; preferred_language: string | null }[]>(
    `profiles?select=id,preferred_language&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (!rows[0]) throw new Error(`Fixture profile ${email} not found — run scripts/dev/seed-local-fixtures.mjs`);
  return rows[0];
}

export async function setPreferredLanguage(profileId: string, language: string | null): Promise<void> {
  await rest(`profiles?id=eq.${profileId}`, { method: 'PATCH', body: JSON.stringify({ preferred_language: language }) });
}

export type FixtureSubject = {
  permissions: ReadonlySet<string>;
  roles: string[];
  isSuperAdmin: boolean;
  isHR: boolean;
  isManager: boolean;
};

/**
 * The same permission subject the app builds in lib/auth/session.ts (roles → role_permissions,
 * organization-scoped roles = HR, manager role or direct reports = manager), read from the database so
 * the navigation spec follows the live role matrix instead of a hard-coded copy.
 */
export async function permissionSubject(email: string): Promise<FixtureSubject> {
  const profile = await rest<{ id: string; employee_id: string | null }[]>(
    `profiles?select=id,employee_id&email=eq.${encodeURIComponent(email)}&limit=1`,
  );
  if (!profile[0]) throw new Error(`Fixture profile ${email} not found`);
  const rows = await rest<{ roles: { key: string; data_scope: string; role_permissions: { module: string; action: string }[] } | null }[]>(
    `user_roles?select=roles(key,data_scope,role_permissions(module,action))&user_id=eq.${profile[0].id}`,
  );
  const roles = rows.flatMap((r) => (r.roles ? [r.roles] : []));
  const permissions = new Set(roles.flatMap((r) => r.role_permissions.map((p) => `${p.module}.${p.action}`)));
  let reports = 0;
  if (profile[0].employee_id) {
    const direct = await rest<{ id: string }[]>(`employees?select=id&manager_id=eq.${profile[0].employee_id}&archived_at=is.null&limit=1`);
    reports = direct.length;
  }
  const keys = roles.map((r) => r.key);
  return {
    permissions,
    roles: keys,
    isSuperAdmin: keys.includes('super_admin'),
    isHR: roles.some((r) => r.data_scope === 'organization') || keys.some((k) => ['super_admin', 'hr_admin', 'hr_officer'].includes(k)),
    isManager: keys.includes('manager') || reports > 0,
  };
}
