/** Session timeouts offered in Settings › Security (minutes; the database allows 5–10080). */
export const SESSION_TIMEOUTS = [15, 30, 60, 120, 240, 480, 720, 1440, 10080] as const;

/** Password policy enforced by Supabase Auth (supabase/config.toml → hosted Auth settings). */
export const PASSWORD_POLICY = { minLength: 8, requireLower: true, requireUpper: true, requireDigit: true } as const;
