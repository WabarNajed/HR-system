'use client';

import { NextIntlClientProvider, useLocale, useMessages, type AbstractIntlMessages } from 'next-intl';
import { useMemo, type ReactNode } from 'react';

/**
 * Adds namespaces to the client message catalog for a subtree (rendered by `ClientMessages`).
 * The parent's messages are kept; locale, time zone, formats and `now` are inherited by the
 * nested provider.
 */
export function ExtendMessages({ messages, children }: { messages: AbstractIntlMessages; children: ReactNode }) {
  const locale = useLocale();
  const parent = useMessages() as AbstractIntlMessages;
  const merged = useMemo(() => ({ ...parent, ...messages }), [parent, messages]);
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  );
}
