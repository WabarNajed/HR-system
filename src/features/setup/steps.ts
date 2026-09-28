/**
 * Setup wizard steps (PRODUCT-SPEC §15) in order. Completion is computed on the server from real
 * data (`queries.ts`); each step has a compact inline form or a deep link to the full page.
 */
export const SETUP_STEPS = [
  'organization',
  'branding',
  'departments',
  'jobTitles',
  'locations',
  'leaveTypes',
  'requestTypes',
  'workflows',
  'hrAdmin',
  'email',
  'employeeImport',
] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

export function isSetupStep(value: unknown): value is SetupStep {
  return typeof value === 'string' && (SETUP_STEPS as readonly string[]).includes(value);
}

/** Full page behind each step. */
export const STEP_LINKS: Record<SetupStep, string> = {
  organization: '/settings/organization',
  branding: '/settings/branding',
  departments: '/settings/departments',
  jobTitles: '/settings/job-titles',
  locations: '/settings/locations',
  leaveTypes: '/settings/leave-types',
  requestTypes: '/settings/request-types',
  workflows: '/settings/workflows',
  hrAdmin: '/settings/users',
  email: '/settings/notifications',
  employeeImport: '/admin/data-management?type=employees',
};

/** Steps that should be done before go-live (the rest are recommended). */
export const REQUIRED_STEPS: ReadonlySet<SetupStep> = new Set(['organization', 'departments', 'jobTitles', 'leaveTypes', 'requestTypes', 'workflows', 'hrAdmin']);
