'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

/** Root error boundary (errors thrown by layouts below the root, e.g. the (app)/(auth) layouts). */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <ErrorState
        variant="page"
        className="w-full max-w-md"
        title={t('pageErrorTitle')}
        description={
          <>
            {t('pageErrorDescription')}
            {error.digest ? <span className="mt-2 block font-mono text-xs text-faint-foreground">{t('errorReference', { id: error.digest })}</span> : null}
          </>
        }
        onRetry={() => reset()}
      />
    </main>
  );
}
