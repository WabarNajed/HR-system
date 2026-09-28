/**
 * Per-certificate verification code (`certificates.verification_code`): 12 characters from a 32-symbol
 * alphabet without 0/1/I/O (60 random bits). It is printed on the certificate and carried by the QR link
 * `/verify/<number>?code=<code>`; the public `verify_certificate` RPC reveals the holder's name, the
 * certificate type and the issue date only when it matches, so sequential numbers cannot be enumerated.
 * Isomorphic (no Node APIs) — generation lives in `server/document.ts`.
 */

export const VERIFICATION_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const VERIFICATION_CODE_LENGTH = 12;
const CODE_RE = /^[2-9A-HJ-NP-Z]{12}$/;

/** Drops separators/spaces and upper-cases (`abcd-efgh-jkmn` → `ABCDEFGHJKMN`); '' when unusable. */
export function normalizeVerificationCode(input: string | null | undefined): string {
  if (!input || input.length > 40) return '';
  return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function isVerificationCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && CODE_RE.test(code);
}

/** Human-friendly grouping for print and display: `ABCD-EFGH-JKMN`. */
export function formatVerificationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/** Relative public verification path; includes the code when known (QR / copied links). */
export function certificateVerifyPath(number: string, code?: string | null): string {
  const path = `/verify/${encodeURIComponent(number)}`;
  return code ? `${path}?code=${encodeURIComponent(code)}` : path;
}
