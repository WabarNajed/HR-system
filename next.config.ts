import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const isDev = process.env.NODE_ENV !== 'production';

/** Supabase origin(s) the browser talks to directly (REST, Auth, Realtime websocket, public Storage). */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`];
  } catch {
    return [];
  }
}

/**
 * Baseline Content-Security-Policy. Scripts: own origin + Next's inline bootstrap/RSC payload
 * (`'unsafe-inline'`; `'unsafe-eval'` only for the dev server's HMR/React debugging). Images may be
 * any https URL (branding assets, images in e-mail template previews). PDF previews use `blob:`
 * frames. Nothing may frame the portal (`frame-ancestors 'none'`).
 */
function contentSecurityPolicy(): string {
  const supabase = supabaseOrigins();
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:', ...supabase.filter((o) => o.startsWith('http'))],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...supabase, ...(isDev ? ['ws:'] : [])],
    'media-src': ["'self'", 'blob:', 'data:'],
    'frame-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`);
  if (!isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // HTTPS deployments only (ignored over plain http, but never pin HSTS on a local `next start`).
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Don't let `next dev` rewrite CLAUDE.md / AGENTS.md (the repo's agent rules are hand-maintained).
  agentRules: false,
  // Heavy Node-only libraries are required at runtime instead of being bundled.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium', 'exceljs', 'nodemailer'],
  // Files read from disk at runtime by server routes (PDF fonts, locale JSON for emails/exports).
  outputFileTracingIncludes: {
    '/**/*': [
      './locales/**/*.json',
      './node_modules/@fontsource/ibm-plex-sans-arabic/files/*-{arabic,latin}-{400,500,600,700}-normal.woff2',
    ],
  },
  // No floating Next.js dev-tools badge: it overlapped the collapsed sidebar's expand button in LTR
  // and blocked automated clicks. Build/runtime errors still show in the dev overlay.
  devIndicators: false,
  // Security response headers on every route (pages, route handlers, static files).
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Never echo Server Action arguments (e.g. sign-in passwords) into the dev server log.
  // …and never log a request URL that carries credentials (a pre-hydration GET submit of a password
  // form; the proxy redirects those to a clean URL — see lib/supabase/proxy.ts).
  logging: {
    serverFunctions: false,
    incomingRequests: { ignore: [/[?&](password|confirmPassword|newPassword|currentPassword|passwordConfirm)=/i] },
  },
  experimental: {
    // `forbidden()` from next/navigation → (app)/forbidden.tsx renders the shared Forbidden state
    // inside the shell (used by requirePermission / requireRole guards).
    authInterrupts: true,
    // Tree-shake barrel imports of icon/primitive packages.
    optimizePackageImports: ['lucide-react', 'radix-ui', 'date-fns', 'recharts'],
  },
};

export default withNextIntl(nextConfig);
