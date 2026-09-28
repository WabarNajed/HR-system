'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { safeAction } from '@/components/shared/safe-action';
import { useErrorMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action';

/**
 * Runs a Server Action and turns its `ActionResult` into toast feedback (success message or mapped
 * error), refreshing the server-rendered page on success. Returns the result for callers that need
 * field errors or data. A rejected action (offline, 5xx, deployment skew) becomes a failed result
 * (`errors.network`, `errors.stale`, …) so callers keep their dialog open; redirects keep propagating.
 */
export function useActionFeedback() {
  const resolve = useErrorMessage();
  const router = useRouter();
  return async function run<T>(
    action: Promise<ActionResult<T>>,
    options: { success?: string; refresh?: boolean; warnOn?: string[] } = {},
  ): Promise<ActionResult<T>> {
    const result: ActionResult<T> | undefined = await safeAction(() => action);
    // Defensive: an action that resolves without a result (navigation took over) counts as done.
    if (!result) return { ok: true };
    if (result.ok) {
      const key = result.message ?? options.success ?? 'common.saved';
      if (options.warnOn?.includes(key)) toast.warning(resolve(key));
      else toast.success(resolve(key));
      if (options.refresh !== false) router.refresh();
    } else {
      toast.error(resolve(result.error));
    }
    return result;
  };
}
