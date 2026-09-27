'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useErrorMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action';

/**
 * Runs a Server Action and turns its `ActionResult` into toast feedback (translated success message or
 * mapped error). Refreshes the server-rendered route on success unless `refresh: false`.
 * Network failures (the action promise rejecting) become `errors.network`.
 */
export function useActionToast() {
  const resolve = useErrorMessage();
  const router = useRouter();
  const run = useCallback(
    async <T,>(action: Promise<ActionResult<T>>, options: { refresh?: boolean; silentSuccess?: boolean } = {}): Promise<ActionResult<T>> => {
      let result: ActionResult<T>;
      try {
        result = await action;
      } catch {
        result = { ok: false, error: 'errors.network' };
      }
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
