'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useTransition } from 'react';
import { toast } from 'sonner';
import { useErrorMessage } from '@/components/ui/form';
import { isNavigationError, transportErrorKey, type ActionTransportErrorKey } from './safe-action';

/** Shows the toast for a Server Action transport failure (stale deployments get a Refresh action). */
export function useTransportErrorToast() {
  const resolve = useErrorMessage();
  const tCommon = useTranslations('common');
  return useCallback(
    (key: ActionTransportErrorKey) => {
      // Fixed id: several actions failing at once (or the route error boundary) show a single toast.
      const id = 'action-transport-error';
      if (key === 'errors.stale') {
        toast.error(resolve(key), { id, action: { label: tCommon('refresh'), onClick: () => window.location.reload() } });
      } else {
        toast.error(resolve(key), { id });
      }
    },
    [resolve, tCommon],
  );
}

/**
 * Drop-in replacement for React's `useTransition` for callbacks that call Server Actions.
 *
 *   const [pending, startTransition] = useActionTransition();
 *   startTransition(async () => {
 *     const result = await saveThing(values);
 *     if (!result.ok) return void toast.error(resolve(result.error));
 *     onOpenChange(false);
 *   });
 *
 * With plain `useTransition`, an action that fails at the transport level (offline, proxy timeout,
 * 5xx, deployment skew) throws out of the async callback into the route error boundary, which
 * unmounts the page — the open dialog/sheet and everything the user typed are lost. Here such a
 * failure is caught, shown as a toast, and the rest of the callback is skipped, so the dialog stays
 * open with its input intact. Next.js control-flow errors (redirect/notFound) and genuine bugs keep
 * propagating as before.
 */
export function useActionTransition(): [isPending: boolean, startTransition: (callback: () => void | Promise<void>) => void] {
  const [isPending, start] = useTransition();
  const showTransportError = useTransportErrorToast();
  const startSafe = useCallback(
    (callback: () => void | Promise<void>) =>
      start(async () => {
        try {
          await callback();
        } catch (error) {
          const key = isNavigationError(error) ? null : transportErrorKey(error);
          if (!key) throw error;
          if (process.env.NODE_ENV !== 'production') console.error(error);
          showTransportError(key);
        }
      }),
    [showTransportError],
  );
  return [isPending, startSafe];
}
