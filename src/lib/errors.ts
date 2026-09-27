/**
 * Maps any error (PostgREST/Postgres, Supabase Auth, Storage, network, zod) to an i18n key.
 * Raw error text is NEVER shown to users (CLAUDE.md) — log it server-side, return the key.
 *
 *   mapError(err) → 'errors.duplicate' | 'errors.forbidden' | 'errors.requestNotEditable' | … | 'errors.generic'
 *
 * Custom DB errors: `RAISE EXCEPTION 'hr:<namespace>.<key>'` (any SQLSTATE) is mapped to
 * `<namespace>.<key>` when that key exists in the message catalog, otherwise `errors.generic`.
 */
import { getMessages } from '@/lib/i18n/messages';

export const GENERIC_ERROR = 'errors.generic';

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  cause?: unknown;
};

/** True when `key` (e.g. `errors.duplicate`, `requests.errors.x`) exists in the catalog. */
export function messageKeyExists(key: string): boolean {
  if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/.test(key)) return false;
  let node: unknown = getMessages('en');
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

function keyOr(key: string, fallback = GENERIC_ERROR): string {
  return messageKeyExists(key) ? key : fallback;
}

const HR_PREFIX = /hr:([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+)+)/;

/** Supabase Auth error codes → message keys. */
const AUTH_CODES: Record<string, string> = {
  invalid_credentials: 'errors.invalidCredentials',
  email_not_confirmed: 'errors.emailNotConfirmed',
  user_already_exists: 'errors.emailTaken',
  email_exists: 'errors.emailTaken',
  weak_password: 'errors.weakPassword',
  same_password: 'errors.samePassword',
  over_request_rate_limit: 'errors.rateLimited',
  over_email_send_rate_limit: 'errors.rateLimited',
  over_sms_send_rate_limit: 'errors.rateLimited',
  otp_expired: 'errors.tokenExpired',
  flow_state_expired: 'errors.tokenExpired',
  flow_state_not_found: 'errors.tokenExpired',
  bad_code_verifier: 'errors.tokenExpired',
  bad_jwt: 'errors.sessionExpired',
  session_not_found: 'errors.sessionExpired',
  session_expired: 'errors.sessionExpired',
  refresh_token_not_found: 'errors.sessionExpired',
  refresh_token_already_used: 'errors.sessionExpired',
  signup_disabled: 'errors.signupDisabled',
  email_provider_disabled: 'errors.signupDisabled',
  user_banned: 'errors.accountDisabled',
  user_not_found: 'errors.invalidCredentials',
  validation_failed: 'errors.validation',
  email_address_invalid: 'validation.email',
  reauthentication_needed: 'errors.sessionExpired',
};

/** Postgres SQLSTATE / PostgREST codes → message keys. */
function mapDbCode(code: string, message: string): string | null {
  switch (code) {
    case '23505':
      return 'errors.duplicate';
    case '23503':
      // Deleting a referenced row vs. inserting a dangling reference.
      return /update or delete on table/i.test(message) ? 'errors.inUse' : 'errors.invalidReference';
    case '23502':
    case '23514':
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
    case '22001':
    case '23P01':
      return 'errors.validation';
    case '42501':
      return 'errors.forbidden';
    case 'PGRST301':
    case 'PGRST302':
    case 'PGRST303':
      return 'errors.sessionExpired';
    case 'PGRST116':
    case 'P0002':
      return 'errors.notFound';
    case '40001':
    case '40P01':
      return 'errors.conflict';
    case '57014':
      return 'errors.timeout';
    case '53300':
    case '53400':
    case '08006':
    case '08001':
    case 'PGRST000':
    case 'PGRST001':
    case 'PGRST002':
      return 'errors.serverError';
    default:
      return null;
  }
}

function isNetworkError(e: ErrorLike, message: string): 'errors.timeout' | 'errors.network' | null {
  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'TimeoutError' || /timed? ?out|timeout/i.test(message)) return 'errors.timeout';
  if (name === 'AbortError' || /aborted/i.test(message)) return 'errors.timeout';
  if (name === 'AuthRetryableFetchError' || /fetch failed|failed to fetch|networkerror|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message)) {
    return 'errors.network';
  }
  return null;
}

/**
 * Returns an i18n key for any thrown/returned error. Unknown errors → `errors.generic`.
 * Already-mapped keys (e.g. `new Error('errors.forbidden')`) pass through when they exist.
 */
export function mapError(error: unknown): string {
  if (!error) return GENERIC_ERROR;
  if (typeof error === 'string') {
    const m = HR_PREFIX.exec(error);
    if (m?.[1]) return keyOr(m[1]);
    return messageKeyExists(error) ? error : GENERIC_ERROR;
  }
  if (typeof error !== 'object') return GENERIC_ERROR;

  const e = error as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : '';
  const code = typeof e.code === 'string' ? e.code : typeof e.code === 'number' ? String(e.code) : '';

  // 1. Custom `hr:` keys raised by our RPCs/triggers (in message, details or hint).
  for (const text of [message, e.details, e.hint]) {
    if (typeof text !== 'string') continue;
    const m = HR_PREFIX.exec(text);
    if (m?.[1]) return keyOr(m[1]);
  }

  // 2. An Error whose message already is a catalog key.
  if (message && messageKeyExists(message)) return message;

  // 3. Known app error classes, then Supabase Auth.
  const name = typeof e.name === 'string' ? e.name : '';
  if (name === 'PdfRenderError') return 'errors.pdfFailed';
  if (name === 'SupabaseNotConfiguredError') return 'errors.notConfigured';
  if (name === 'ZodError') return 'errors.validation';
  if (code && AUTH_CODES[code]) return keyOr(AUTH_CODES[code]!);
  if (name.startsWith('Auth')) {
    if (name === 'AuthSessionMissingError' || name === 'AuthInvalidJwtError') return 'errors.sessionExpired';
    const net = isNetworkError(e, message);
    if (net) return net;
    if (/invalid login credentials/i.test(message)) return 'errors.invalidCredentials';
    if (/email not confirmed/i.test(message)) return 'errors.emailNotConfirmed';
    if (/rate limit/i.test(message)) return 'errors.rateLimited';
    if (e.status === 429) return 'errors.rateLimited';
    if (e.status === 422 && /password/i.test(message)) return 'errors.weakPassword';
  }

  // 4. Postgres / PostgREST.
  if (code) {
    const mapped = mapDbCode(code, message);
    if (mapped) return keyOr(mapped);
  }

  // 5. Storage / HTTP-ish statuses.
  const status = typeof e.status === 'number' ? e.status : typeof e.status === 'string' ? Number(e.status) : NaN;
  if (status === 401) return 'errors.sessionExpired';
  if (status === 403) return 'errors.forbidden';
  if (status === 404) return 'errors.notFound';
  if (status === 409) return 'errors.conflict';
  if (status === 413) return 'errors.fileTooLarge';
  if (status === 429) return 'errors.rateLimited';

  // 6. Network / timeouts (including wrapped causes).
  const net = isNetworkError(e, message);
  if (net) return net;
  if (e.cause && e.cause !== error) {
    const inner = mapError(e.cause);
    if (inner !== GENERIC_ERROR) return inner;
  }
  if (status >= 500) return 'errors.serverError';

  return GENERIC_ERROR;
}

/** Short correlation id for server logs ↔ user reports. */
export function correlationId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/** Logs the raw error server-side with context; returns the mapped key. */
export function logAndMapError(scope: string, error: unknown, cid: string = correlationId()): string {
  const key = mapError(error);
  const e = (error ?? {}) as ErrorLike;
  console.error(
    `[${scope}] [${cid}] → ${key}`,
    typeof e.code === 'string' ? `code=${e.code}` : '',
    typeof e.message === 'string' ? e.message : error,
  );
  return key;
}
