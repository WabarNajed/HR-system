'use client';

import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { Direction } from 'radix-ui';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { dir as directionOf, type Locale } from '@/lib/i18n/config';
import { formats } from '@/lib/i18n/formats';

export type ProvidersProps = {
  locale: Locale;
  /** Messages for the client: `ROOT_CLIENT_NAMESPACES` (route layouts add more with `ClientMessages`). */
  messages: AbstractIntlMessages;
  timeZone: string;
  /**
   * Request time of the document (root layout). next-intl's `useNow()` and `format.relativeTime()`
   * use it, so relative times hydrate identically. It is not refreshed on client navigations: for a
   * ticking or long-lived relative time use `useNow({ updateInterval })`.
   */
  now?: Date;
  children: ReactNode;
};

/**
 * App-wide client providers: i18n, theme (class strategy, storageKey "theme"), Radix direction,
 * tooltips and the toast host. Mounted once in the root layout.
 */
export function Providers({ locale, messages, timeZone, now, children }: ProvidersProps) {
  const dir = directionOf(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} now={now} formats={formats}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="theme" disableTransitionOnChange>
        <Direction.Provider dir={dir}>
          <TooltipProvider delayDuration={250} skipDelayDuration={150}>
            {children}
            <Toaster dir={dir} />
          </TooltipProvider>
        </Direction.Provider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
