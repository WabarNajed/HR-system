/** Cookie holding the desktop sidebar state (`1` = collapsed); read on the server to avoid layout shift. */
export const SIDEBAR_COOKIE = 'sidebar_collapsed';

/** Serializable data the (app) layout passes to the client shell. */
export type ShellUser = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  /** Stable seed for the avatar tint (employee id or user id). */
  seed: string;
  roleLabel: string | null;
  jobTitle: string | null;
};

export type ShellBranding = {
  portalName: string;
  logoUrl: string | null;
};

export type ShellPermissions = {
  canAddEmployee: boolean;
};
