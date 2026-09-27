import {
  ArchiveRestoreIcon,
  AwardIcon,
  BarChart3Icon,
  BellRingIcon,
  BriefcaseIcon,
  Building2Icon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  CheckCheckIcon,
  ClipboardListIcon,
  DatabaseZapIcon,
  FileBadgeIcon,
  FileTextIcon,
  FolderOpenIcon,
  FormInputIcon,
  GitBranchIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MailIcon,
  MapPinIcon,
  PaletteIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TimerIcon,
  UserCheckIcon,
  UserCogIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import type { AccessRule } from '@/lib/permissions';

/**
 * Navigation + route access (PRODUCT-SPEC §16, ARCHITECTURE §8/§9).
 *
 * - `ROUTE_ACCESS` is the single source of truth for who may open each authenticated route:
 *   pages call `await requireAccess(ROUTE_ACCESS['/employees'])`, the sidebar/settings console hide
 *   items the user can't open (cosmetic — RLS + page guards enforce).
 * - Labels are i18n keys (`nav.*`); icons are lucide components.
 * This module is isomorphic (no server-only imports): the server computes visible item ids, the
 * client sidebar renders them.
 */

/* ─── Route access rules ─────────────────────────────────────────────────── */

const ANY_ACTIVE: AccessRule = {};
const SETTINGS_VIEW: AccessRule = { anyOf: ['settings.view'] };

export const ROUTE_ACCESS = {
  '/dashboard': ANY_ACTIVE,
  '/employees': { anyOf: ['employees.view'], managers: true },
  '/employees/new': { anyOf: ['employees.create'] },
  /** Detail visibility is decided by RLS (own record, direct reports, HR). */
  '/employees/[id]': ANY_ACTIVE,
  '/employees/[id]/edit': { anyOf: ['employees.edit'] },
  '/requests': ANY_ACTIVE,
  '/requests/new': ANY_ACTIVE,
  '/requests/[id]': ANY_ACTIVE,
  '/approvals': { anyOf: ['approvals.approve', 'requests.approve'], managers: true },
  '/leave': ANY_ACTIVE,
  '/documents': ANY_ACTIVE,
  '/certificates': ANY_ACTIVE,
  /** Managers get team-scoped reports (RLS limits rows to themselves + direct reports). */
  '/reports': { anyOf: ['reports.view'], managers: true },
  '/reports/[reportKey]': { anyOf: ['reports.view'], managers: true },
  '/reports/builder': { anyOf: ['reports.view'], managers: true },
  '/notifications': ANY_ACTIVE,
  '/profile': ANY_ACTIVE,
  '/setup': { anyOf: ['settings.administer'] },
  '/settings': SETTINGS_VIEW,
  '/settings/organization': SETTINGS_VIEW,
  '/settings/branding': SETTINGS_VIEW,
  '/settings/users': { anyOf: ['users.view'] },
  '/settings/roles': { anyOf: ['users.view'] },
  '/settings/pending-registrations': { anyOf: ['users.view', 'users.approve'] },
  '/settings/departments': SETTINGS_VIEW,
  '/settings/job-titles': SETTINGS_VIEW,
  '/settings/locations': SETTINGS_VIEW,
  '/settings/cost-centers': SETTINGS_VIEW,
  '/settings/leave-types': { anyOf: ['settings.view', 'leave.administer'] },
  '/settings/public-holidays': { anyOf: ['settings.view', 'leave.administer'] },
  '/settings/request-types': SETTINGS_VIEW,
  '/settings/form-builder': SETTINGS_VIEW,
  '/settings/workflows': SETTINGS_VIEW,
  '/settings/sla': SETTINGS_VIEW,
  '/settings/document-templates': { anyOf: ['settings.view', 'certificates.administer'] },
  '/settings/certificate-templates': { anyOf: ['settings.view', 'certificates.administer'] },
  '/settings/email-templates': SETTINGS_VIEW,
  '/settings/notifications': SETTINGS_VIEW,
  '/settings/security': { anyOf: ['settings.administer'] },
  '/admin/data-management': { anyOf: ['employees.create', 'settings.administer'] },
  '/admin/audit-logs': { anyOf: ['audit.view'] },
  '/admin/backup': { anyOf: ['settings.administer'] },
} as const satisfies Record<string, AccessRule>;

export type RoutePattern = keyof typeof ROUTE_ACCESS;

/* ─── Main sidebar ───────────────────────────────────────────────────────── */

export type NavLabelKey =
  | `nav.items.${'dashboard' | 'employees' | 'requests' | 'approvals' | 'leave' | 'documents' | 'certificates' | 'reports' | 'settings' | 'auditLog' | 'dataManagement' | 'backup'}`;

export type NavItem = {
  id: string;
  href: RoutePattern;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  access: AccessRule;
  /** Extra path prefixes that mark this item active. */
  match?: readonly string[];
};

export type NavGroup = {
  id: string;
  labelKey: `nav.groups.${'home' | 'people' | 'operations' | 'services' | 'insights' | 'administration'}`;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    labelKey: 'nav.groups.home',
    items: [{ id: 'dashboard', href: '/dashboard', labelKey: 'nav.items.dashboard', icon: LayoutDashboardIcon, access: ROUTE_ACCESS['/dashboard'] }],
  },
  {
    id: 'people',
    labelKey: 'nav.groups.people',
    items: [{ id: 'employees', href: '/employees', labelKey: 'nav.items.employees', icon: UsersIcon, access: ROUTE_ACCESS['/employees'] }],
  },
  {
    id: 'operations',
    labelKey: 'nav.groups.operations',
    items: [
      { id: 'requests', href: '/requests', labelKey: 'nav.items.requests', icon: InboxIcon, access: ROUTE_ACCESS['/requests'] },
      { id: 'approvals', href: '/approvals', labelKey: 'nav.items.approvals', icon: CheckCheckIcon, access: ROUTE_ACCESS['/approvals'] },
      { id: 'leave', href: '/leave', labelKey: 'nav.items.leave', icon: CalendarDaysIcon, access: ROUTE_ACCESS['/leave'] },
    ],
  },
  {
    id: 'services',
    labelKey: 'nav.groups.services',
    items: [
      { id: 'documents', href: '/documents', labelKey: 'nav.items.documents', icon: FolderOpenIcon, access: ROUTE_ACCESS['/documents'] },
      { id: 'certificates', href: '/certificates', labelKey: 'nav.items.certificates', icon: AwardIcon, access: ROUTE_ACCESS['/certificates'] },
    ],
  },
  {
    id: 'insights',
    labelKey: 'nav.groups.insights',
    items: [{ id: 'reports', href: '/reports', labelKey: 'nav.items.reports', icon: BarChart3Icon, access: ROUTE_ACCESS['/reports'] }],
  },
  {
    id: 'administration',
    labelKey: 'nav.groups.administration',
    items: [
      {
        id: 'settings',
        href: '/settings',
        labelKey: 'nav.items.settings',
        icon: SettingsIcon,
        access: ROUTE_ACCESS['/settings'],
      },
      { id: 'auditLog', href: '/admin/audit-logs', labelKey: 'nav.items.auditLog', icon: ScrollTextIcon, access: ROUTE_ACCESS['/admin/audit-logs'] },
      {
        id: 'dataManagement',
        href: '/admin/data-management',
        labelKey: 'nav.items.dataManagement',
        icon: DatabaseZapIcon,
        access: ROUTE_ACCESS['/admin/data-management'],
      },
      { id: 'backup', href: '/admin/backup', labelKey: 'nav.items.backup', icon: ArchiveRestoreIcon, access: ROUTE_ACCESS['/admin/backup'] },
    ],
  },
];

/* ─── Settings console ───────────────────────────────────────────────────── */

export type SettingsItemKey =
  | 'organization'
  | 'branding'
  | 'users'
  | 'roles'
  | 'pendingRegistrations'
  | 'departments'
  | 'jobTitles'
  | 'locations'
  | 'costCenters'
  | 'leaveTypes'
  | 'publicHolidays'
  | 'requestTypes'
  | 'formBuilder'
  | 'workflows'
  | 'sla'
  | 'documentTemplates'
  | 'certificateTemplates'
  | 'emailTemplates'
  | 'notifications'
  | 'security'
  | 'dataManagement'
  | 'auditLog'
  | 'backup';

export type SettingsNavItem = {
  key: SettingsItemKey;
  href: RoutePattern;
  icon: LucideIcon;
  access: AccessRule;
};

export type SettingsNavGroup = {
  key: 'general' | 'peopleAccess' | 'hrSetup' | 'leave' | 'requests' | 'documents' | 'communication' | 'system';
  items: SettingsNavItem[];
};

const s = (key: SettingsItemKey, href: RoutePattern, icon: LucideIcon): SettingsNavItem => ({ key, href, icon, access: ROUTE_ACCESS[href] });

/** Labels: `nav.settings.groups.<group>`, `nav.settings.items.<key>`, `nav.settings.descriptions.<key>`. */
export const SETTINGS_NAV: SettingsNavGroup[] = [
  { key: 'general', items: [s('organization', '/settings/organization', Building2Icon), s('branding', '/settings/branding', PaletteIcon)] },
  {
    key: 'peopleAccess',
    items: [
      s('users', '/settings/users', UserCogIcon),
      s('roles', '/settings/roles', ShieldCheckIcon),
      s('pendingRegistrations', '/settings/pending-registrations', UserCheckIcon),
    ],
  },
  {
    key: 'hrSetup',
    items: [
      s('departments', '/settings/departments', LandmarkIcon),
      s('jobTitles', '/settings/job-titles', BriefcaseIcon),
      s('locations', '/settings/locations', MapPinIcon),
      s('costCenters', '/settings/cost-centers', WalletIcon),
    ],
  },
  { key: 'leave', items: [s('leaveTypes', '/settings/leave-types', CalendarDaysIcon), s('publicHolidays', '/settings/public-holidays', CalendarRangeIcon)] },
  {
    key: 'requests',
    items: [
      s('requestTypes', '/settings/request-types', ClipboardListIcon),
      s('formBuilder', '/settings/form-builder', FormInputIcon),
      s('workflows', '/settings/workflows', GitBranchIcon),
      s('sla', '/settings/sla', TimerIcon),
    ],
  },
  {
    key: 'documents',
    items: [s('documentTemplates', '/settings/document-templates', FileTextIcon), s('certificateTemplates', '/settings/certificate-templates', FileBadgeIcon)],
  },
  { key: 'communication', items: [s('emailTemplates', '/settings/email-templates', MailIcon), s('notifications', '/settings/notifications', BellRingIcon)] },
  {
    key: 'system',
    items: [
      s('security', '/settings/security', ShieldCheckIcon),
      s('dataManagement', '/admin/data-management', DatabaseZapIcon),
      s('auditLog', '/admin/audit-logs', ScrollTextIcon),
      s('backup', '/admin/backup', ArchiveRestoreIcon),
    ],
  },
];

/** Settings home cards (PRODUCT-SPEC §16): card → the console items it links to. */
export const SETTINGS_HOME_CARDS: {
  key: 'organization' | 'branding' | 'usersAccess' | 'hrStructure' | 'requestManagement' | 'leaveManagement' | 'documents' | 'dataManagement' | 'securityAudit';
  icon: LucideIcon;
  items: SettingsItemKey[];
}[] = [
  { key: 'organization', icon: Building2Icon, items: ['organization'] },
  { key: 'branding', icon: PaletteIcon, items: ['branding'] },
  { key: 'usersAccess', icon: UserCogIcon, items: ['users', 'roles', 'pendingRegistrations'] },
  { key: 'hrStructure', icon: LandmarkIcon, items: ['departments', 'jobTitles', 'locations', 'costCenters'] },
  { key: 'requestManagement', icon: ClipboardListIcon, items: ['requestTypes', 'formBuilder', 'workflows', 'sla'] },
  { key: 'leaveManagement', icon: CalendarDaysIcon, items: ['leaveTypes', 'publicHolidays'] },
  { key: 'documents', icon: FileTextIcon, items: ['documentTemplates', 'certificateTemplates', 'emailTemplates'] },
  { key: 'dataManagement', icon: DatabaseZapIcon, items: ['dataManagement'] },
  { key: 'securityAudit', icon: ShieldCheckIcon, items: ['security', 'notifications', 'auditLog', 'backup'] },
];

export const SETTINGS_ITEMS_BY_KEY: Record<SettingsItemKey, SettingsNavItem> = Object.fromEntries(
  SETTINGS_NAV.flatMap((g) => g.items.map((i) => [i.key, i])),
) as Record<SettingsItemKey, SettingsNavItem>;

/* ─── Breadcrumb labels ──────────────────────────────────────────────────── */

/**
 * Static path → i18n label key for the header breadcrumbs. Dynamic segments (`[id]`) show the
 * label a page registers with `useBreadcrumbLabel()` / `<BreadcrumbLabel>`, else `common.details`.
 */
export const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'nav.items.dashboard',
  '/employees': 'nav.items.employees',
  '/employees/new': 'nav.header.addEmployee',
  '/requests': 'nav.items.requests',
  '/requests/new': 'nav.items.newRequest',
  '/approvals': 'nav.items.approvals',
  '/leave': 'nav.items.leave',
  '/documents': 'nav.items.documents',
  '/certificates': 'nav.items.certificates',
  '/reports': 'nav.items.reports',
  '/reports/builder': 'nav.items.reportBuilder',
  '/notifications': 'nav.items.notifications',
  '/profile': 'nav.items.profile',
  '/setup': 'nav.items.setup',
  '/settings': 'nav.items.settings',
  '/admin': 'nav.admin.title',
  '/admin/data-management': 'nav.admin.dataManagement',
  '/admin/audit-logs': 'nav.admin.auditLogs',
  '/admin/backup': 'nav.admin.backup',
  ...Object.fromEntries(SETTINGS_NAV.flatMap((g) => g.items.filter((i) => i.href.startsWith('/settings/')).map((i) => [i.href, `nav.settings.items.${i.key}`]))),
};

/** Crumbs that have no page of their own (rendered as plain text, not links). */
export const NON_LINK_PATHS: ReadonlySet<string> = new Set(['/admin']);

/** Segment label used after a dynamic segment (e.g. `/employees/[id]/edit`). */
export const SEGMENT_LABELS: Record<string, string> = {
  edit: 'common.edit',
  new: 'common.new',
};
