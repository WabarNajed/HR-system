'use client';

import { CheckCircle2Icon, AlertCircleIcon, IdCardIcon, PencilIcon, PhoneIcon, SendIcon, UserRoundIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/components/ui/form';
import { InputGroup } from '@/components/ui/input-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { registrationDetailsWithForm } from '../form-actions';
import { initialFormState, type RegistrationDetailsField } from '../form-state';
import { registrationDetailsSchema } from '../schemas';
import { ProgressiveField, useFormResultToast, useHydrated, useProgressiveForm } from './progressive-form';

type Props = {
  defaults: { fullName: string; employeeNumber: string; mobile: string; note: string };
  /** Answering an information request (form open, "Resubmit"); otherwise a collapsible edit. */
  infoRequested: boolean;
};

/**
 * Applicant updates their registration details (answers HR's information request → back to review).
 * Progressive: the optional edit is a native `<details>` disclosure and the form a plain POST to the
 * Server Action, so both work before hydration / without JavaScript.
 */
export function RegistrationDetailsForm({ defaults, infoRequested }: Props) {
  const t = useTranslations('auth.pending');
  const tr = useTranslations('auth.register');
  const tc = useTranslations('common');
  const resolve = useErrorMessage();
  const { state, formAction, pending, errors, onSubmit, onInput } = useProgressiveForm(
    registrationDetailsSchema,
    registrationDetailsWithForm,
    initialFormState<RegistrationDetailsField>(),
  );
  // Also open after a no-JavaScript submit (the re-rendered page carries the result to show).
  const [open, setOpen] = useState(infoRequested || state.status !== 'idle');
  // Inline result alerts are the no-JavaScript fallback; hydrated forms confirm with toasts.
  const hydrated = useHydrated();
  // A successful save folds the optional editor away (the page itself is revalidated).
  const [handledSeq, setHandledSeq] = useState(state.seq);
  if (handledSeq !== state.seq) {
    setHandledSeq(state.seq);
    if (state.status === 'success' && !infoRequested) setOpen(false);
  }
  const values = { ...defaults, ...state.values };

  useFormResultToast(state);

  const form = (
    <form
      action={formAction}
      onSubmit={onSubmit}
      onInput={onInput}
      noValidate
      className="mt-4 flex flex-col gap-3.5"
      aria-busy={pending}
    >
      {!hydrated && state.status === 'success' && state.message ? (
        <Alert variant="success">
          <CheckCircle2Icon />
          <AlertDescription>{resolve(state.message)}</AlertDescription>
        </Alert>
      ) : null}
      {!hydrated && state.error && state.error !== 'errors.validation' ? (
        <Alert variant="danger" aria-live="assertive">
          <AlertCircleIcon />
          <AlertDescription>{resolve(state.error)}</AlertDescription>
        </Alert>
      ) : null}
      <ProgressiveField label={tr('fullName')} required error={errors.fullName}>
        {(field) => (
          <InputGroup {...field} name="fullName" autoComplete="name" start={<UserRoundIcon />} defaultValue={values.fullName} readOnly={pending} required />
        )}
      </ProgressiveField>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <ProgressiveField label={tr('employeeNumber')} required error={errors.employeeNumber}>
          {(field) => <InputGroup {...field} name="employeeNumber" dir="ltr" start={<IdCardIcon />} defaultValue={values.employeeNumber} readOnly={pending} required />}
        </ProgressiveField>
        <ProgressiveField label={tr('mobile')} required error={errors.mobile}>
          {(field) => (
            <InputGroup
              {...field}
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              start={<PhoneIcon />}
              defaultValue={values.mobile}
              readOnly={pending}
              required
            />
          )}
        </ProgressiveField>
      </div>
      <ProgressiveField label={t('noteToHr')} optional error={errors.note}>
        {(field) => <Textarea {...field} name="note" rows={3} maxLength={1000} placeholder={t('notePlaceholder')} defaultValue={values.note} readOnly={pending} />}
      </ProgressiveField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {!infoRequested ? (
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {tc('cancel')}
          </Button>
        ) : null}
        <Button type="submit" loading={pending} className="min-w-32">
          {!pending ? <SendIcon className="rtl:-scale-x-100" /> : null}
          {infoRequested ? t('resubmit') : tc('saveChanges')}
        </Button>
      </div>
    </form>
  );

  if (infoRequested) {
    return (
      <div className="mt-5 rounded-lg border border-border bg-card p-4 shadow-card">
        <h2 className="text-card-title text-foreground">{t('updateTitle')}</h2>
        <p className="mt-0.5 text-meta text-muted-foreground">{t('updateDescription')}</p>
        {form}
      </div>
    );
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn('group mt-3', open && 'mt-5 rounded-lg border border-border bg-card p-4 shadow-card')}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden',
          open && 'sr-only',
        )}
      >
        <PencilIcon className="size-4" aria-hidden />
        {t('editDetails')}
      </summary>
      <h2 className="text-card-title text-foreground">{t('editDetails')}</h2>
      <p className="mt-0.5 text-meta text-muted-foreground">{t('editDescription')}</p>
      {form}
    </details>
  );
}
