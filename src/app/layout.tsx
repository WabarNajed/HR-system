import type { Metadata, Viewport } from 'next';
import { getLocale, getMessages, getTimeZone } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { brandingPortalName, getPublicBranding } from '@/lib/branding';
import { dir, resolveLocale } from '@/lib/i18n/config';
import { getTranslator } from '@/lib/i18n/translator';
import { brandCssText } from '@/lib/utils';
import { fontVariables } from './fonts';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const [locale, branding] = await Promise.all([getLocale(), getPublicBranding()]);
  const lang = resolveLocale(locale);
  const name = brandingPortalName(branding, lang, getTranslator(lang)('common.appName'));
  return {
    title: { default: name, template: `%s · ${name}` },
    applicationName: name,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a1215' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, timeZone, branding] = await Promise.all([getLocale(), getMessages(), getTimeZone(), getPublicBranding()]);
  // Runtime branding (Settings › Branding): validated hex colors only → safe to inline.
  const brandCss = brandCssText({ primary: branding.primaryColor, secondary: branding.secondaryColor });

  return (
    <html lang={locale} dir={dir(locale)} className={fontVariables} suppressHydrationWarning>
      <head>{brandCss ? <style id="brand-vars" dangerouslySetInnerHTML={{ __html: brandCss }} /> : null}</head>
      <body>
        <Providers locale={locale} messages={messages} timeZone={timeZone}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
