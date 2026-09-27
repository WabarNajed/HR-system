import { ShieldCheckIcon } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { ScaffoldPlaceholder } from '@/components/shared/scaffold-placeholder';
import { BrandMark } from '@/components/shell/brand-mark';
import { LanguageSwitch } from '@/components/shell/language-switch';
import { brandingPortalName, getPublicBranding } from '@/lib/branding';
import { resolveLocale } from '@/lib/i18n/config';
import { pageMetadata } from '@/lib/metadata';

export const generateMetadata = (): Promise<Metadata> => pageMetadata('verify.title', 'verify.description');

/**
 * PUBLIC certificate verification (no auth) — route scaffold. The certificates module implements it
 * with RPC `verify_certificate(p_number)` (anon-granted; returns only number, name, type, date, status).
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ certificateNumber: string }> }) {
  const [{ certificateNumber }, t, tCommon, branding, locale] = await Promise.all([
    params,
    getTranslations('verify'),
    getTranslations('common'),
    getPublicBranding(),
    getLocale(),
  ]);
  const portalName = brandingPortalName(branding, resolveLocale(locale), tCommon('appName'));
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark name={portalName} logoUrl={branding.logoUrl} size="sm" />
          <span className="truncate text-sm font-semibold">{portalName}</span>
        </div>
        <LanguageSwitch variant="label" />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-10 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ShieldCheckIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-section-title">{t('title')}</h1>
            <p className="text-meta text-muted-foreground">
              <bdi dir="ltr" className="numeric font-medium text-foreground">
                {decodeURIComponent(certificateNumber)}
              </bdi>
            </p>
          </div>
        </div>
        <ScaffoldPlaceholder module="verify" showHomeLink={false} />
      </main>
    </div>
  );
}
