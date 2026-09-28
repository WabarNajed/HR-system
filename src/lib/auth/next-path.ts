/**
 * Strict post-sign-in redirect target (isomorphic, no dependencies).
 *
 * Only a same-origin, root-relative path is accepted. Values are rejected when they contain control
 * characters or backslashes (WHATWG URL parsing strips TAB/LF and treats `\` like `/`, so
 * `/\t/evil.com` would become `//evil.com`), when they resolve to another origin, or when the
 * normalized path is protocol-relative (`/.//evil.com` → `//evil.com`). The returned value is the
 * normalized `pathname + search + hash`; auth pages and API routes are never redirect targets.
 */
const INTERNAL_ORIGIN = 'http://internal.invalid';
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;
const EXCLUDED = /^\/(login|register|auth\/|api\/)/;

export function strictNextPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || UNSAFE_CHARS.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_ORIGIN) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return fallback;
  if (EXCLUDED.test(path)) return fallback;
  return path;
}
