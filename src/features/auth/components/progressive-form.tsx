'use client';

import { useActionState, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';
import { useErrorMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { FormActionState } from '../form-state';

/**
 * Progressive-enhancement form kit for the auth / account forms.
 *
 * The form renders as `<form method="POST" action={formAction}>` bound to a Server Action through
 * `useActionState`, so a submit before hydration (or with JavaScript off) is a real POST to the
 * Server Action — nothing lands in the URL and nothing is lost. When hydrated, `onSubmit` validates
 * the FormData with the same zod schema first and blocks the round trip on invalid input; the server
 * validates again and echoes non-secret values back (inputs are uncontrolled with `defaultValue`,
 * so React's post-action form reset restores what the user typed).
 */
export function useProgressiveForm<V extends string, D>(
  schema: z.ZodType,
  action: (state: FormActionState<V, D>, formData: FormData) => Promise<FormActionState<V, D>>,
  initial: FormActionState<V, D>,
) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [clientErrors, setClientErrors] = useState<Partial<Record<V, string>> | null>(null);
  // A new server result replaces client-side errors.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setClientErrors(null);
  }
  const errors: Partial<Record<V, string>> = clientErrors ?? state.fieldErrors;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const values: Record<string, string> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === 'string') values[key] = value;
    });
    const parsed = schema.safeParse(values);
    if (parsed.success) {
      setClientErrors(null);
      return; // React dispatches the Server Action
    }
    event.preventDefault();
    const next: Partial<Record<V, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '') as V;
      if (key && !next[key]) next[key] = issue.message;
    }
    setClientErrors(next);
    const first = Object.keys(next)[0];
    if (first) form.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`)?.focus();
  };

  /** Clears a field's error as soon as the user edits it. */
  const onInput = (event: FormEvent<HTMLFormElement>) => {
    const name = (event.target as HTMLInputElement | null)?.name as V | undefined;
    if (name && errors[name]) setClientErrors({ ...errors, [name]: undefined });
  };

  return { state, formAction, pending, errors, onSubmit, onInput };
}

type FieldControlProps = { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string };

/** Label + control + description + error for a progressive form field (ids and ARIA wired up). */
export function ProgressiveField({
  label,
  required,
  optional,
  description,
  error,
  className,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  optional?: boolean;
  description?: ReactNode;
  /** i18n key (or `key|{json params}`) of the field error. */
  error?: string | null;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const descriptionId = description ? `${id}-description` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div data-slot="form-item" className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id} data-error={error ? true : undefined} className="data-[error=true]:text-danger">
        {label}
        {required ? (
          <span aria-hidden className="text-danger">
            *
          </span>
        ) : null}
        {optional ? <span className="font-normal text-faint-foreground">{tc('optionalSuffix')}</span> : null}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {description ? (
        <p id={descriptionId ?? undefined} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p data-slot="form-message" id={errorId ?? undefined} className="text-xs font-medium text-danger">
          {resolve(error)}
        </p>
      ) : null}
    </div>
  );
}
