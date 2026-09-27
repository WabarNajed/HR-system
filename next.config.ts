import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

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
  // Never echo Server Action arguments (e.g. sign-in passwords) into the dev server log.
  logging: { serverFunctions: false },
  experimental: {
    // `forbidden()` from next/navigation → (app)/forbidden.tsx renders the shared Forbidden state
    // inside the shell (used by requirePermission / requireRole guards).
    authInterrupts: true,
    // Tree-shake barrel imports of icon/primitive packages.
    optimizePackageImports: ['lucide-react', 'radix-ui', 'date-fns', 'recharts'],
  },
};

export default withNextIntl(nextConfig);
