'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { safeAction } from '@/components/shared/safe-action';
import { useErrorMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action';

/**
 * Runs a Server Action and turns its `ActionResult` into toast feedback (translated success message or
 * mapped error). Refreshes the server-rendered route on success unless `refresh: false`.
 * A rejected action (offline, 5xx, deployment skew) becomes a failed result (`errors.network`,
 * `errors.stale`, …) so callers keep their dialog open; redirects keep propagating.
 */
export function useActionToast() {
  const resolve = useErrorMessage();
  const router = useRouter();
  const run = useCallback(
    async <T,>(action: Promise<ActionResult<T>>, options: { refresh?: boolean; silentSuccess?: boolean } = {}): Promise<ActionResult<T>> => {
      const result: ActionResult<T> = await safeAction(() => action);
      if (result.ok) {
        if (!options.silentSuccess && result.message) toast.success(resolve(result.message));
        if (options.refresh !== false) router.refresh();
      } else {
        toast.error(resolve(result.error));
      }
      return result;
    },
    [resolve, router],
  );
  return { run, resolve };
}
