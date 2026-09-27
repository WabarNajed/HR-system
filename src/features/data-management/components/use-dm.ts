'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useErrorMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action';
import { issueParams } from '../lib/messages';
import { fieldLabelKey, getField } from '../lib/schemas';
import type { ImportType, Issue } from '../lib/types';

export type LooseT = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };

/** Untyped translator for keys built from data (import types, fields, issue codes). */
export function useLooseT(namespace?: string): LooseT {
  const t = useTranslations(namespace as never);
  return t as unknown as LooseT;
}

/** Translates an import field key to its column label. */
export function useFieldLabel(type: ImportType) {
  const t = useLooseT('dataManagement.fields');
  return useCallback(
    (key: string | undefined) => {
      if (!key) return '';
      const field = getField(type, key);
      const labelKey = field ? fieldLabelKey(field) : key;
      return t.has(labelKey) ? t(labelKey) : key;
    },
    [t, type],
  );
}

/** Full sentence for a validation issue. */
export function useIssueText(type: ImportType) {
  const t = useLooseT('dataManagement.issues');
  const all = useLooseT();
  const label = useFieldLabel(type);
  return useCallback(
    (issue: Issue) => {
      const params = issueParams(issue, type, label, (k) => (all.has(k) ? all(k) : k));
      return t.has(issue.code) ? t(issue.code, params) : issue.code;
    },
    [t, all, label, type],
  );
}

/** Runs an action, toasts its error (and optional success) and returns data or null. */
export function useRunAction() {
  const resolve = useErrorMessage();
  return useCallback(
    async <T>(promise: Promise<ActionResult<T>>, options: { success?: string; silent?: boolean } = {}): Promise<{ ok: true; data: T | undefined } | { ok: false; error: string }> => {
      let result: ActionResult<T>;
      try {
        result = await promise;
      } catch {
        result = { ok: false, error: 'errors.network' };
      }
      if (!result.ok) {
        if (!options.silent) toast.error(resolve(result.error));
        return { ok: false, error: result.error };
      }
      const message = result.message ?? options.success;
      if (message) toast.success(resolve(message));
      return { ok: true, data: result.data };
    },
    [resolve],
  );
}
