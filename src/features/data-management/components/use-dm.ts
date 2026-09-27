'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useErrorMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/action';
import { useDateFormat } from '@/lib/i18n/use-date-format';
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
  const fmt = useDateFormat();
  return useCallback(
    (issue: Issue) => {
      const params = issueParams(issue, type, label, (k) => (all.has(k) ? all(k) : k));
      for (const key of ['date', 'converted'] as const) {
        const v = params[key];
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) params[key] = fmt.date(v);
      }
      if (typeof params.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.value) && issue.code === 'implausibleAge') params.value = fmt.date(params.value);
      // First-strong isolates keep IDs, e-mails and ISO dates intact inside right-to-left sentences.
      for (const key of ['value', 'rows', 'number', 'nationalId', 'row', 'name'] as const) {
        const v = params[key];
        if (v !== '' && v !== undefined && v !== null) params[key] = `\u2068${v}\u2069`;
      }
      return t.has(issue.code) ? t(issue.code, params) : issue.code;
    },
    [t, all, label, type, fmt],
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
