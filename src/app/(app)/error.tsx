'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/shared/error-state';
import { transportErrorKey } from '@/components/shared/safe-action';

/** Last time a transport failure was auto-recovered (module scope: survives boundary remounts). */
let lastAutoRecover = 0;
const AUTO_RECOVER_WINDOW_MS = 10_000;

/**
 * Error boundary for authenticated pages (inside the shell). Never shows raw error details.
 *
 * Safety net for Server Action calls that are not wrapped in `safeAction()`: a transport failure
 * (offline, proxy/5xx, deployment skew) is reported as a toast and the page is re-rendered in place
 * instead of being replaced by the error card. A second failure within 10 s shows the card.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [recoverKey] = useState(() => {
    const key = transportErrorKey(error);
    return key && Date.now() - lastAutoRecover > AUTO_RECOVER_WINDOW_MS ? key : null;
  });

  useEffect(() => {
    console.error(error);
    if (!recoverKey) return;
    lastAutoRecover = Date.now();
    const message = t(recoverKey.slice('errors.'.length) as 'network');
    // Fixed id: one toast even when the effect runs twice (Strict Mode) or several actions fail at once.
    const id = 'action-transport-error';
    if (recoverKey === 'errors.stale') {
      toast.error(message, { id, action: { label: tCommon('refresh'), onClick: () => window.location.reload() } });
    } else {
      toast.error(message, { id });
    }
    reset();
  }, [error, recoverKey, reset, t, tCommon]);

  if (recoverKey) return null;

  return (
    <div className="flex flex-col gap-4">
      <ErrorState
        variant="page"
        title={t('pageErrorTitle')}
        description={
          <>
            {t('pageErrorDescription')}
            {error.digest ? (
              <span className="mt-2 block text-xs text-faint-foreground">
                {t.rich('errorReferenceRich', {
                  id: error.digest,
                  ref: (chunks) => (
                    <bdi dir="ltr" className="font-mono select-all">
                      {chunks}
                    </bdi>
                  ),
                })}
              </span>
            ) : null}
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
