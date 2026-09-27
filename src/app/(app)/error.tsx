'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

/** Error boundary for authenticated pages (inside the shell). Never shows raw error details. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col gap-4">
      <ErrorState
        variant="page"
        title={t('pageErrorTitle')}
        description={
          <>
            {t('pageErrorDescription')}
            {error.digest ? <span className="mt-2 block font-mono text-xs text-faint-foreground">{t('errorReference', { id: error.digest })}</span> : null}
          </>
        }
        onRetry={() => {
          router.refresh();
          reset();
        }}
      />
    </div>
  );
}
