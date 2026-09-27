/**
 * Static message registry — every namespace file for every locale is imported here so the
 * bundler includes them (no runtime fs access, works on Vercel/edge) and `pnpm check:i18n`
 * can rely on the list. Adding a namespace = add the two JSON files + one line per locale below.
 */
import type { Locale } from './config';

import ar_common from '../../../locales/ar/common.json';
import ar_nav from '../../../locales/ar/nav.json';
import ar_auth from '../../../locales/ar/auth.json';
import ar_dashboard from '../../../locales/ar/dashboard.json';
import ar_employees from '../../../locales/ar/employees.json';
import ar_requests from '../../../locales/ar/requests.json';
import ar_approvals from '../../../locales/ar/approvals.json';
import ar_leave from '../../../locales/ar/leave.json';
import ar_documents from '../../../locales/ar/documents.json';
import ar_certificates from '../../../locales/ar/certificates.json';
import ar_reports from '../../../locales/ar/reports.json';
import ar_notifications from '../../../locales/ar/notifications.json';
import ar_settings from '../../../locales/ar/settings.json';
import ar_users from '../../../locales/ar/users.json';
import ar_roles from '../../../locales/ar/roles.json';
import ar_masterData from '../../../locales/ar/masterData.json';
import ar_requestConfig from '../../../locales/ar/requestConfig.json';
import ar_templates from '../../../locales/ar/templates.json';
import ar_dataManagement from '../../../locales/ar/dataManagement.json';
import ar_audit from '../../../locales/ar/audit.json';
import ar_backup from '../../../locales/ar/backup.json';
import ar_search from '../../../locales/ar/search.json';
import ar_profile from '../../../locales/ar/profile.json';
import ar_setup from '../../../locales/ar/setup.json';
import ar_verify from '../../../locales/ar/verify.json';
import ar_statuses from '../../../locales/ar/statuses.json';
import ar_enums from '../../../locales/ar/enums.json';
import ar_errors from '../../../locales/ar/errors.json';
import ar_validation from '../../../locales/ar/validation.json';
import ar_security from '../../../locales/ar/security.json';

import en_common from '../../../locales/en/common.json';
import en_nav from '../../../locales/en/nav.json';
import en_auth from '../../../locales/en/auth.json';
import en_dashboard from '../../../locales/en/dashboard.json';
import en_employees from '../../../locales/en/employees.json';
import en_requests from '../../../locales/en/requests.json';
import en_approvals from '../../../locales/en/approvals.json';
import en_leave from '../../../locales/en/leave.json';
import en_documents from '../../../locales/en/documents.json';
import en_certificates from '../../../locales/en/certificates.json';
import en_reports from '../../../locales/en/reports.json';
import en_notifications from '../../../locales/en/notifications.json';
import en_settings from '../../../locales/en/settings.json';
import en_users from '../../../locales/en/users.json';
import en_roles from '../../../locales/en/roles.json';
import en_masterData from '../../../locales/en/masterData.json';
import en_requestConfig from '../../../locales/en/requestConfig.json';
import en_templates from '../../../locales/en/templates.json';
import en_dataManagement from '../../../locales/en/dataManagement.json';
import en_audit from '../../../locales/en/audit.json';
import en_backup from '../../../locales/en/backup.json';
import en_search from '../../../locales/en/search.json';
import en_profile from '../../../locales/en/profile.json';
import en_setup from '../../../locales/en/setup.json';
import en_verify from '../../../locales/en/verify.json';
import en_statuses from '../../../locales/en/statuses.json';
import en_enums from '../../../locales/en/enums.json';
import en_errors from '../../../locales/en/errors.json';
import en_validation from '../../../locales/en/validation.json';
import en_security from '../../../locales/en/security.json';

export const namespaces = [
  'common',
  'nav',
  'auth',
  'dashboard',
  'employees',
  'requests',
  'approvals',
  'leave',
  'documents',
  'certificates',
  'reports',
  'notifications',
  'settings',
  'users',
  'roles',
  'masterData',
  'requestConfig',
  'templates',
  'dataManagement',
  'audit',
  'backup',
  'search',
  'profile',
  'setup',
  'verify',
  'statuses',
  'enums',
  'errors',
  'validation',
  'security',
] as const;

export type Namespace = (typeof namespaces)[number];

const arMessages = {
  common: ar_common,
  nav: ar_nav,
  auth: ar_auth,
  dashboard: ar_dashboard,
  employees: ar_employees,
  requests: ar_requests,
  approvals: ar_approvals,
  leave: ar_leave,
  documents: ar_documents,
  certificates: ar_certificates,
  reports: ar_reports,
  notifications: ar_notifications,
  settings: ar_settings,
  users: ar_users,
  roles: ar_roles,
  masterData: ar_masterData,
  requestConfig: ar_requestConfig,
  templates: ar_templates,
  dataManagement: ar_dataManagement,
  audit: ar_audit,
  backup: ar_backup,
  search: ar_search,
  profile: ar_profile,
  setup: ar_setup,
  verify: ar_verify,
  statuses: ar_statuses,
  enums: ar_enums,
  errors: ar_errors,
  validation: ar_validation,
  security: ar_security,
};

const enMessages = {
  common: en_common,
  nav: en_nav,
  auth: en_auth,
  dashboard: en_dashboard,
  employees: en_employees,
  requests: en_requests,
  approvals: en_approvals,
  leave: en_leave,
  documents: en_documents,
  certificates: en_certificates,
  reports: en_reports,
  notifications: en_notifications,
  settings: en_settings,
  users: en_users,
  roles: en_roles,
  masterData: en_masterData,
  requestConfig: en_requestConfig,
  templates: en_templates,
  dataManagement: en_dataManagement,
  audit: en_audit,
  backup: en_backup,
  search: en_search,
  profile: en_profile,
  setup: en_setup,
  verify: en_verify,
  statuses: en_statuses,
  enums: en_enums,
  errors: en_errors,
  validation: en_validation,
  security: en_security,
};

/** Shape of the full message tree (English is the reference for types). */
export type Messages = typeof enMessages;

const registry: Record<Locale, Messages> = {
  // Arabic files must have identical keys (enforced by `pnpm check:i18n`).
  ar: arMessages as Messages,
  en: enMessages,
};

/** Returns every namespace for the locale. Synchronous and cheap (static imports). */
export function getMessages(locale: Locale): Messages {
  return registry[locale];
}

/** Async variant for `getRequestConfig` and other async call sites. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  return registry[locale];
}

/** Picks a subset of namespaces (e.g. to send fewer messages to a client boundary). */
export function pickNamespaces<N extends Namespace>(locale: Locale, keys: readonly N[]): Pick<Messages, N> {
  const all = registry[locale];
  const out = {} as Pick<Messages, N>;
  for (const key of keys) out[key] = all[key];
  return out;
}
