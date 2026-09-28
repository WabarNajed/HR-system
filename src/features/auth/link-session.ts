/**
 * Whether the current session was established by an e-mail link (invitation / password recovery)
 * recently enough to set a new password WITHOUT the current one. Password sessions must use
 * My profile › Account & security, which re-authenticates with the current password.
 *
 * GoTrue records how a session was obtained in the JWT `amr` claim: token-hash / OTP verification
 * (`/auth/confirm`) → `otp`, implicit / PKCE links → `invite` / `recovery` / `magiclink`.
 */

const LINK_METHODS = new Set(['otp', 'recovery', 'invite', 'magiclink']);

/** How long after following the link the "set password" step stays available. */
export const LINK_SESSION_MAX_AGE_SECONDS = 60 * 60;

type AmrEntry = { method?: unknown; timestamp?: unknown };

export function isRecentLinkSession(claims: Record<string, unknown> | null | undefined, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  return (amr as AmrEntry[]).some(
    (entry) =>
      typeof entry?.method === 'string' &&
      LINK_METHODS.has(entry.method) &&
      typeof entry.timestamp === 'number' &&
      nowSeconds - entry.timestamp <= LINK_SESSION_MAX_AGE_SECONDS,
  );
}
