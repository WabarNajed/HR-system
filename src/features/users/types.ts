/** Shared (isomorphic) types of the users module. */

export type ProfileStatus = 'pending' | 'info_requested' | 'active' | 'rejected' | 'disabled';
export const PROFILE_STATUSES: readonly ProfileStatus[] = ['active', 'disabled', 'pending', 'info_requested', 'rejected'];

export type DataScope = 'own' | 'team' | 'organization';

export type RoleOption = {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isSystem: boolean;
  dataScope: DataScope;
  rank: number;
  memberCount: number;
};

export type EmployeeRef = {
  id: string;
  employee_number: string | null;
  name_ar: string | null;
  name_en: string | null;
  department?: { name_ar: string | null; name_en: string | null } | null;
  job_title?: { name_ar: string | null; name_en: string | null } | null;
};

export type UserRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  mobile: string | null;
  status: ProfileStatus;
  roles: string[];
  employee: EmployeeRef | null;
  lastLoginAt: string | null;
  createdAt: string;
  invitedAt: string | null;
  /** Invited by an admin and never signed in. */
  invitationPending: boolean;
  isSelf: boolean;
};

export type UserStats = { total: number; active: number; invited: number; disabled: number; pendingRegistrations: number };

export type RegistrationTab = 'pending' | 'info_requested' | 'rejected';
export const REGISTRATION_TABS: readonly RegistrationTab[] = ['pending', 'info_requested', 'rejected'];

/** How the suggested employee matched the ID the applicant typed. */
export type MatchKind = 'number' | 'nationalId' | 'none';

export type RegistrationRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  mobile: string | null;
  enteredId: string | null;
  note: string | null;
  status: ProfileStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  updatedAt: string;
  match: (EmployeeRef & { linked: boolean }) | null;
  matchKind: MatchKind;
};

export type RegistrationStats = { pending: number; infoRequested: number; rejected30d: number; approved30d: number };

/** Option returned by the employee picker search. */
export type EmployeePickerOption = {
  id: string;
  employeeNumber: string | null;
  nameAr: string | null;
  nameEn: string | null;
  departmentAr: string | null;
  departmentEn: string | null;
  jobTitleAr: string | null;
  jobTitleEn: string | null;
  /** Already linked to another portal account. */
  linked: boolean;
};

export type PortalAccess = {
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    status: ProfileStatus;
    roles: string[];
    lastLoginAt: string | null;
    invitedAt: string | null;
    invitationPending: boolean;
    isSelf: boolean;
  } | null;
};
