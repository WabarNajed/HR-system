import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ConfigurationRequired } from '@/components/shared/configuration-required';
import { BrandMark } from '@/components/shell/brand-mark';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { BrandPanel } from '@/features/auth/components/brand-panel';
import {
  brandingCompanyName,
  brandingLoginSubtitle,
  brandingLoginTitle,
  brandingPortalName,
  getPublicBranding,
} from '@/lib/branding';
import { resolveLocale } from '@/lib/i18n/config';
import { isSupabaseConfigured } from '@/lib/supabase/env';

/**
 * Auth pages (sign in, register, password flows, account status): premium split screen —
 * brand panel (logo, portal name, login title/subtitle from Branding, patterned brand surface)
 * + form panel with language switch and theme toggle. Single column below `lg`.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <ConfigurationRequired />;
  const [branding, rawLocale, t, tAuth] = await Promise.all([
    getPublicBranding(),
    getLocale(),
    getTranslations('common'),
    getTranslations('auth'),
  ]);
  const locale = resolveLocale(rawLocale);
  const portalName = brandingPortalName(branding, locale, t('appName'));
  const companyName = brandingCompanyName(branding, locale);
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Form panel (logical start) */}
      <div className="relative flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2.5 lg:invisible">
            <BrandMark name={portalName} logoUrl={branding.logoUrl} size="sm" />
            <span className="truncate text-sm font-semibold text-foreground">{portalName}</span>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitch variant="label" />
            <ThemeToggle />
          </div>
        </header>

        <main className="flex flex-1 items-start justify-center px-5 pt-[9vh] pb-10 sm:px-8 lg:items-center lg:pt-4">
          <div className="w-full max-w-[25rem]">{children}</div>
        </main>

        <footer className="px-4 pb-6 text-center text-xs text-faint-foreground sm:px-8 lg:hidden">
          {tAuth('brand.copyright', { year, name: companyName ?? portalName })}
        </footer>
      </div>

      {/* Brand panel (logical end) */}
      <BrandPanel
        className="sticky top-0 hidden h-dvh lg:flex"
        portalName={portalName}
        companyName={companyName}
        logoUrl={branding.logoUrl}
        loginImageUrl={branding.loginImageUrl}
        title={brandingLoginTitle(branding, locale)}
        subtitle={brandingLoginSubtitle(branding, locale)}
        year={year}
      />
    </div>
  );
}
