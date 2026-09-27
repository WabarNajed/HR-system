/**
 * Local QA fixture accounts (scripts/dev/seed-local-fixtures.mjs). Local stack only — the password
 * is the public fixture value, overridable with LOCAL_FIXTURE_PASSWORD.
 */
export const FIXTURE_PASSWORD = process.env.LOCAL_FIXTURE_PASSWORD ?? 'Passw0rd!Local';

export const USERS = {
  superadmin: 'superadmin@hr.local',
  hradmin: 'hradmin@hr.local',
  hrofficer: 'hrofficer@hr.local',
  manager: 'manager@hr.local',
  employee: 'employee@hr.local',
  employee2: 'employee2@hr.local',
  pending: 'pending@hr.local',
  disabled: 'disabled@hr.local',
} as const;

export type FixtureUser = keyof typeof USERS;

/** Roles whose signed-in session global.setup.ts stores in e2e/.auth/<role>.json. */
export const SESSION_ROLES = ['superadmin', 'hradmin', 'hrofficer', 'manager', 'employee'] as const satisfies readonly FixtureUser[];
export type SessionRole = (typeof SESSION_ROLES)[number];

export const storageStatePath = (role: SessionRole) => `e2e/.auth/${role}.json`;
