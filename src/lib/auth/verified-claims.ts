/**
 * Proxy → server hand-off of the session claims the proxy already verified.
 *
 * `src/proxy.ts` verifies the session on every request (`auth.getClaims()`; with the legacy
 * symmetric HS256 signing key that is a network round trip to Supabase Auth). The session loader
 * (`getSessionState`) would otherwise verify the same token again, so every render paid two
 * sequential Auth round trips before its first query.
 *
 * The proxy therefore forwards `{ sub, email, exp }` in a request header that it ALWAYS overwrites
 * (any client-supplied value is dropped). Because some paths bypass the proxy (matcher exclusions),
 * the header is additionally
 *  - signed with HMAC-SHA-256 under a key derived from `SUPABASE_SERVICE_ROLE_KEY` (server-only), and
 *  - bound to the exact access token (SHA-256) that was verified; the loader recomputes the hash
 *    from the session cookie of its own request, so a different/rotated token falls back to a
 *    fresh `getClaims()`.
 * Without the service-role key nothing is forwarded (plain `getClaims()` everywhere).
 *
 * Web Crypto only — runs in the proxy and in Server Components alike.
 */

export const VERIFIED_CLAIMS_HEADER = 'x-hr-verified-claims';

export type ForwardedClaims = { sub: string; email: string | null };

type Payload = { sub: string; email: string | null; exp: number; th: string };

const encoder = new TextEncoder();
let cachedKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKey(): Promise<CryptoKey> | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) return null;
  if (cachedKey?.secret !== secret) {
    cachedKey = {
      secret,
      key: crypto.subtle.importKey('raw', encoder.encode(`hr-portal/verified-claims/v1:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
      ]),
    };
  }
  return cachedKey.key;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function tokenHash(accessToken: string): Promise<string> {
  return toBase64Url(await crypto.subtle.digest('SHA-256', encoder.encode(accessToken)));
}

/** Proxy: header value for claims verified from `accessToken`, or `null` when forwarding is off. */
export async function signVerifiedClaims(
  claims: { sub: string; email?: unknown; exp?: unknown },
  accessToken: string,
): Promise<string | null> {
  const key = hmacKey();
  if (!key || !accessToken || typeof claims.exp !== 'number') return null;
  const payload: Payload = {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    exp: claims.exp,
    th: await tokenHash(accessToken),
  };
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign('HMAC', await key, encoder.encode(body));
  return `${body}.${toBase64Url(mac)}`;
}

/**
 * Server: the forwarded claims when the header is authentic, unexpired and was issued for
 * `accessToken` (the token in this request's session cookie); otherwise `null`.
 */
export async function readVerifiedClaims(value: string | null | undefined, accessToken: string | null | undefined): Promise<ForwardedClaims | null> {
  const key = hmacKey();
  if (!key || !value || !accessToken || value.length > 4096) return null;
  const [body, mac, extra] = value.split('.');
  if (!body || !mac || extra !== undefined) return null;
  const signature = fromBase64Url(mac);
  if (!signature) return null;
  const valid = await crypto.subtle.verify('HMAC', await key, signature, encoder.encode(body));
  if (!valid) return null;

  let payload: Partial<Payload>;
  try {
    const bytes = fromBase64Url(body);
    if (!bytes) return null;
    payload = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Payload>;
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.exp !== 'number' || typeof payload.th !== 'string') return null;
  if (payload.exp * 1000 <= Date.now()) return null;
  if (payload.th !== (await tokenHash(accessToken))) return null;
  return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}
